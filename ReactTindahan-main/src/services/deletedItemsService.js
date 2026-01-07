import { dataService } from '../services/DataService';

export const deletedItemsService = {
  // Soft delete - move to deleted_items table
  async softDelete(entityType, entityId, originalData, userId, username) {
    try {
      // Get the actual entity from its table using DataService
      let entity;
      switch (entityType) {
        case 'products':
          entity = await dataService.getById('products', entityId);
          break;
        case 'suppliers':
          entity = await dataService.getById('suppliers', entityId);
          break;
        case 'categories':
          entity = await dataService.getById('categories', entityId);
          break;
        default:
          throw new Error(`Unknown entity type: ${entityType}`);
      }

      if (!entity) {
        throw new Error(`${entityType} with ID ${entityId} not found`);
      }

      // Store the deleted item
      const deletedResult = await dataService.add('deleted_items', {
        entity_type: entityType,
        entity_id: entityId,
        original_data: JSON.stringify(originalData || entity),
        deleted_by: username,
        deleted_by_id: userId,
        deleted_at: new Date().toISOString(),
        restored_at: null,
        confirmed_at: null,
        // Store related data that might be needed for restoration
        related_data: await this.getRelatedData(entityType, entityId)
      });

      // Get the actual ID returned by dataService
      const deletedId = deletedResult?.deleted_id || deletedResult?.id || Date.now();

      // Now actually delete from the original table
      await this.hardDeleteFromTable(entityType, entityId);

      return deletedId;
    } catch (error) {
      console.error('Error in softDelete:', error);
      throw error;
    }
  },

  // Get related data before deletion
  async getRelatedData(entityType, entityId) {
    try {
      let relatedData = {};
      
      switch (entityType) {
        case 'products':
          // Get inventory, stock card, sale items, resupplied items
          const inventory = await dataService.getAll('inventory', { 
            where: { product_id: entityId } 
          });
          const stockCards = await dataService.getAll('stock_card', { 
            where: { product_id: entityId } 
          });
          const saleItems = await dataService.getAll('sale_items', { 
            where: { product_id: entityId } 
          });
          const resuppliedItems = await dataService.getAll('resupplied_items', { 
            where: { product_id: entityId } 
          });
          
          relatedData = {
            inventory,
            stock_cards: stockCards,
            sale_items: saleItems,
            resupplied_items: resuppliedItems
          };
          break;

        case 'suppliers':
          // Get inventory, stock card, resupplied items with this supplier
          const supplierInventory = await dataService.getAll('inventory', { 
            where: { supplier_id: entityId } 
          });
          const supplierStockCards = await dataService.getAll('stock_card', { 
            where: { supplier_id: entityId } 
          });
          const supplierResupplied = await dataService.getAll('resupplied_items', { 
            where: { supplier_id: entityId } 
          });
          
          relatedData = {
            inventory: supplierInventory,
            stock_cards: supplierStockCards,
            resupplied_items: supplierResupplied
          };
          break;

        case 'categories':
          // Get products with this category
          const categoryProducts = await dataService.getAll('products', { 
            where: { category_id: entityId } 
          });
          
          relatedData = {
            products: categoryProducts
          };
          break;
      }

      return JSON.stringify(relatedData);
    } catch (error) {
      console.error('Error getting related data:', error);
      return JSON.stringify({});
    }
  },

  // Hard delete from original table
  async hardDeleteFromTable(entityType, entityId) {
    try {
      switch (entityType) {
        case 'products':
          // Delete product
          await dataService.delete('products', entityId);
          
          // Delete related records
          await this.deleteRelatedRecords('inventory', 'product_id', entityId);
          await this.deleteRelatedRecords('stock_card', 'product_id', entityId);
          await this.deleteRelatedRecords('sale_items', 'product_id', entityId);
          await this.deleteRelatedRecords('resupplied_items', 'product_id', entityId);
          break;

        case 'suppliers':
          // Delete supplier
          await dataService.delete('suppliers', entityId);
          
          // Note: Don't delete inventory/stock cards as they need supplier info for history
          // But we need to update them to handle the missing supplier
          await this.handleSupplierDeletionCleanup(entityId);
          break;

        case 'categories':
          // Delete category
          await dataService.delete('categories', entityId);
          
          // Update products to remove category reference
          await this.updateProductsWithoutCategory(entityId);
          break;
      }
    } catch (error) {
      console.error(`Error in hardDeleteFromTable for ${entityType}:`, error);
      throw error;
    }
  },

  // Helper: Delete related records by foreign key
  async deleteRelatedRecords(tableName, foreignKey, entityId) {
    try {
      // Get all records with this foreign key
      const records = await dataService.getAll(tableName, { where: { [foreignKey]: entityId } });
      
      // Delete them one by one
      for (const record of records) {
        const idField = this.getPrimaryKeyField(tableName);
        const recordId = record[idField] || record.id;
        
        if (recordId) {
          await dataService.delete(tableName, recordId);
        } else {
          console.warn(`No ID found for record in ${tableName}`, record);
        }
      }
    } catch (error) {
      console.error(`Error deleting related records from ${tableName}:`, error);
    }
  },

  // Helper: Handle supplier deletion cleanup
  async handleSupplierDeletionCleanup(supplierId) {
    try {
      // For inventory items with this supplier, we should either:
      // 1. Set supplier_id to null
      // 2. Or delete them (more drastic)
      
      // Option 1: Set supplier_id to null
      const inventoryItems = await dataService.getAll('inventory', { 
        where: { supplier_id: supplierId } 
      });
      
      for (const item of inventoryItems) {
        const idField = this.getPrimaryKeyField('inventory');
        const itemId = item[idField] || item.product_id;
        
        if (itemId) {
          await dataService.update('inventory', itemId, {
            supplier_id: null,
            updated_at: new Date().toISOString(),
            updated_by: 'System (Supplier Deleted)'
          });
        }
      }
    } catch (error) {
      console.error('Error handling supplier deletion cleanup:', error);
    }
  },

  // Helper: Update products when category is deleted
  async updateProductsWithoutCategory(categoryId) {
    try {
      const products = await dataService.getAll('products', { 
        where: { category_id: categoryId } 
      });
      
      for (const product of products) {
        const productId = product.product_id || product.id;
        
        if (productId) {
          await dataService.update('products', productId, {
            category_id: null,
            updated_at: new Date().toISOString(),
            updated_by: 'System (Category Deleted)'
          });
        }
      }
    } catch (error) {
      console.error('Error updating products without category:', error);
    }
  },

  // Helper: Get primary key field for a table
  getPrimaryKeyField(tableName) {
    const primaryKeys = {
      'users': 'user_id',
      'products': 'product_id',
      'categories': 'category_id',
      'suppliers': 'supplier_id',
      'inventory': 'product_id',
      'sales': 'sales_id',
      'sale_items': 'sale_items_id',
      'stock_card': 'stock_card_id',
      'product_units': 'product_units_id',
      'resupplied_items': 'resupplied_items_id',
      'deleted_items': 'deleted_id',
      'backup': 'backup_id'
    };
    
    return primaryKeys[tableName] || 'id';
  },

  // Restore deleted item
  async restoreItem(deletedId) {
    try {
      const deletedItem = await dataService.getById('deleted_items', deletedId);
      if (!deletedItem) throw new Error('Deleted item not found');

      const originalData = JSON.parse(deletedItem.original_data);
      const relatedData = deletedItem.related_data ? JSON.parse(deletedItem.related_data) : {};

      let restoredId;
      
      switch (deletedItem.entity_type) {
        case 'products':
          // Remove the old ID to let database generate a new one
          const { product_id, id, ...productData } = originalData;
          
          // Restore product
          const productResult = await dataService.add('products', {
            ...productData,
            created_at: new Date().toISOString(),
            created_by: deletedItem.deleted_by + ' (restored)'
          });

          const newProductId = productResult?.product_id || productResult?.id;

          // Restore related data if available
          if (relatedData.inventory && relatedData.inventory.length > 0) {
            for (const inv of relatedData.inventory) {
              const { inventory_id, id, ...inventoryData } = inv;
              await dataService.add('inventory', {
                ...inventoryData,
                product_id: newProductId // Use new product ID
              });
            }
          }
          
          if (relatedData.stock_cards && relatedData.stock_cards.length > 0) {
            for (const stock of relatedData.stock_cards) {
              const { stock_card_id, id, ...stockData } = stock;
              await dataService.add('stock_card', {
                ...stockData,
                product_id: newProductId // Use new product ID
              });
            }
          }
          
          restoredId = newProductId;
          break;

        case 'suppliers':
          const { supplier_id: oldSupplierId, id: supplierOldId, ...supplierData } = originalData;
          
          const supplierResult = await dataService.add('suppliers', {
            ...supplierData,
            created_at: new Date().toISOString(),
            created_by: deletedItem.deleted_by + ' (restored)'
          });

          restoredId = supplierResult?.supplier_id || supplierResult?.id;
          break;

        case 'categories':
          const { category_id: oldCategoryId, id: categoryOldId, ...categoryData } = originalData;
          
          const categoryResult = await dataService.add('categories', {
            ...categoryData,
            created_at: new Date().toISOString(),
            created_by: deletedItem.deleted_by + ' (restored)'
          });

          restoredId = categoryResult?.category_id || categoryResult?.id;
          break;
      }

      // Mark as restored
      const deletedItemId = deletedItem.deleted_id || deletedItem.id;
      await dataService.update('deleted_items', deletedItemId, {
        restored_at: new Date().toISOString(),
        restored_by: this.getCurrentUsername(),
        restored_to_id: restoredId
      });

      return restoredId;
    } catch (error) {
      console.error('Error restoring item:', error);
      throw error;
    }
  },

  // Confirm deletion (permanent delete)
  async confirmDeletion(deletedId) {
    try {
      const deletedItem = await dataService.getById('deleted_items', deletedId);
      if (!deletedItem) throw new Error('Deleted item not found');

      // Mark as confirmed (permanently deleted)
      const deletedItemId = deletedItem.deleted_id || deletedItem.id;
      await dataService.update('deleted_items', deletedItemId, {
        confirmed_at: new Date().toISOString(),
        confirmed_by: this.getCurrentUsername()
      });

      // Note: We keep the record in deleted_items for audit trail
      return true;
    } catch (error) {
      console.error('Error confirming deletion:', error);
      throw error;
    }
  },

  // Get all deleted items
  async getDeletedItems(showRestored = false) {
    try {
      let allDeletedItems = await dataService.getAll('deleted_items');
      
      // Sort by deletion date (newest first)
      allDeletedItems.sort((a, b) => 
        new Date(b.deleted_at) - new Date(a.deleted_at)
      );
      
      if (!showRestored) {
        allDeletedItems = allDeletedItems.filter(item => 
          !item.restored_at && !item.confirmed_at
        );
      }
      
      return allDeletedItems;
    } catch (error) {
      console.error('Error getting deleted items:', error);
      return [];
    }
  },

  // Get deleted items by entity type
  async getDeletedItemsByType(entityType, includeRestored = false) {
    try {
      let allDeletedItems = await dataService.getAll('deleted_items');
      
      // Filter by entity type
      let filteredItems = allDeletedItems.filter(item => 
        item.entity_type === entityType
      );
      
      // Sort by deletion date (newest first)
      filteredItems.sort((a, b) => 
        new Date(b.deleted_at) - new Date(a.deleted_at)
      );
      
      if (!includeRestored) {
        filteredItems = filteredItems.filter(item => 
          !item.restored_at && !item.confirmed_at
        );
      }
      
      return filteredItems;
    } catch (error) {
      console.error('Error getting deleted items by type:', error);
      return [];
    }
  },

  // Get count of pending deletions (not restored or confirmed)
  async getPendingDeletionCount() {
    try {
      const allDeletedItems = await dataService.getAll('deleted_items');
      
      const pendingCount = allDeletedItems.filter(item => 
        !item.restored_at && !item.confirmed_at
      ).length;
      
      return pendingCount;
    } catch (error) {
      console.error('Error getting pending deletion count:', error);
      return 0;
    }
  },

  // Get recently deleted items (last 7 days)
  async getRecentDeletedItems(days = 7) {
    try {
      const allDeletedItems = await dataService.getAll('deleted_items');
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const recentItems = allDeletedItems.filter(item => {
        const deletedDate = new Date(item.deleted_at);
        return deletedDate >= cutoffDate && !item.restored_at && !item.confirmed_at;
      });
      
      // Sort by deletion date (newest first)
      recentItems.sort((a, b) => 
        new Date(b.deleted_at) - new Date(a.deleted_at)
      );
      
      return recentItems;
    } catch (error) {
      console.error('Error getting recent deleted items:', error);
      return [];
    }
  },

  // Check if user can delete (for owner mode restrictions)
  canDelete(userRole) {
    return userRole === 'owner' || userRole === 'admin';
  },

  // Check if user can restore
  canRestore(userRole) {
    return userRole === 'owner' || userRole === 'admin';
  },

  // Helper: Get current username from localStorage
  getCurrentUsername() {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      return user?.username || 'System';
    } catch {
      return 'System';
    }
  },

  // Clean up old confirmed deletions (older than 30 days)
  async cleanupOldDeletions(daysToKeep = 30) {
    try {
      const allDeletedItems = await dataService.getAll('deleted_items');
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const oldItems = allDeletedItems.filter(item => {
        const deletedDate = new Date(item.deleted_at);
        return deletedDate < cutoffDate && item.confirmed_at;
      });
      
      // Delete these old confirmed items
      for (const item of oldItems) {
        const idField = this.getPrimaryKeyField('deleted_items');
        const itemId = item[idField] || item.id;
        
        if (itemId) {
          await dataService.delete('deleted_items', itemId);
        }
      }
      
      console.log(`Cleaned up ${oldItems.length} old confirmed deletions`);
      return oldItems.length;
    } catch (error) {
      console.error('Error cleaning up old deletions:', error);
      return 0;
    }
  },

  // Get deletion statistics
  async getDeletionStats() {
    try {
      const allDeletedItems = await dataService.getAll('deleted_items');
      
      const stats = {
        total: allDeletedItems.length,
        pending: allDeletedItems.filter(item => !item.restored_at && !item.confirmed_at).length,
        restored: allDeletedItems.filter(item => item.restored_at && !item.confirmed_at).length,
        confirmed: allDeletedItems.filter(item => item.confirmed_at).length,
        by_entity_type: {}
      };
      
      // Count by entity type
      allDeletedItems.forEach(item => {
        if (!stats.by_entity_type[item.entity_type]) {
          stats.by_entity_type[item.entity_type] = 0;
        }
        stats.by_entity_type[item.entity_type]++;
      });
      
      return stats;
    } catch (error) {
      console.error('Error getting deletion stats:', error);
      return {
        total: 0,
        pending: 0,
        restored: 0,
        confirmed: 0,
        by_entity_type: {}
      };
    }
  }
};