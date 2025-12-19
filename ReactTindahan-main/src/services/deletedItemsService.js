import { db } from '../db';

export const deletedItemsService = {
  // Soft delete - move to deleted_items table
  async softDelete(entityType, entityId, originalData, userId, username) {
    try {
      // Get the actual entity from its table
      let entity;
      switch (entityType) {
        case 'products':
          entity = await db.products.get(entityId);
          break;
        case 'suppliers':
          entity = await db.suppliers.get(entityId);
          break;
        case 'categories':
          entity = await db.categories.get(entityId);
          break;
        default:
          throw new Error(`Unknown entity type: ${entityType}`);
      }

      if (!entity) {
        throw new Error(`${entityType} with ID ${entityId} not found`);
      }

      // Store the deleted item
      const deletedId = await db.deleted_items.add({
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
          const inventory = await db.inventory.where('product_id').equals(entityId).toArray();
          const stockCards = await db.stock_card.where('product_id').equals(entityId).toArray();
          const saleItems = await db.sale_items.where('product_id').equals(entityId).toArray();
          const resuppliedItems = await db.resupplied_items.where('product_id').equals(entityId).toArray();
          
          relatedData = {
            inventory,
            stock_cards: stockCards,
            sale_items: saleItems,
            resupplied_items: resuppliedItems
          };
          break;

        case 'suppliers':
          // Get inventory, stock card, resupplied items with this supplier
          const supplierInventory = await db.inventory.where('supplier_id').equals(entityId).toArray();
          const supplierStockCards = await db.stock_card.where('supplier_id').equals(entityId).toArray();
          const supplierResupplied = await db.resupplied_items.where('supplier_id').equals(entityId).toArray();
          
          relatedData = {
            inventory: supplierInventory,
            stock_cards: supplierStockCards,
            resupplied_items: supplierResupplied
          };
          break;

        case 'categories':
          // Get products with this category
          const categoryProducts = await db.products.where('category_id').equals(entityId).toArray();
          
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
    switch (entityType) {
      case 'products':
        await db.products.delete(entityId);
        await db.inventory.where('product_id').equals(entityId).delete();
        await db.stock_card.where('product_id').equals(entityId).delete();
        await db.sale_items.where('product_id').equals(entityId).delete();
        await db.resupplied_items.where('product_id').equals(entityId).delete();
        break;

      case 'suppliers':
        await db.suppliers.delete(entityId);
        // Note: Don't delete inventory/stock cards as they need supplier info for history
        break;

      case 'categories':
        await db.categories.delete(entityId);
        // Update products to remove category reference
        await db.products.where('category_id').equals(entityId).modify({ category_id: null });
        break;
    }
  },

  // Restore deleted item
  async restoreItem(deletedId) {
    try {
      const deletedItem = await db.deleted_items.get(deletedId);
      if (!deletedItem) throw new Error('Deleted item not found');

      const originalData = JSON.parse(deletedItem.original_data);
      const relatedData = deletedItem.related_data ? JSON.parse(deletedItem.related_data) : {};

      let restoredId;
      
      switch (deletedItem.entity_type) {
        case 'products':
          // Restore product
          restoredId = await db.products.add({
            ...originalData,
            created_at: new Date().toISOString(), // Update creation date
            created_by: deletedItem.deleted_by + ' (restored)'
          });

          // Restore related data if available
          if (relatedData.inventory && relatedData.inventory.length > 0) {
            for (const inv of relatedData.inventory) {
              await db.inventory.add({
                ...inv,
                product_id: restoredId // Use new product ID
              });
            }
          }
          
          if (relatedData.stock_cards && relatedData.stock_cards.length > 0) {
            for (const stock of relatedData.stock_cards) {
              await db.stock_card.add({
                ...stock,
                product_id: restoredId // Use new product ID
              });
            }
          }
          break;

        case 'suppliers':
          restoredId = await db.suppliers.add({
            ...originalData,
            created_at: new Date().toISOString(),
            created_by: deletedItem.deleted_by + ' (restored)'
          });
          break;

        case 'categories':
          restoredId = await db.categories.add({
            ...originalData,
            created_at: new Date().toISOString(),
            created_by: deletedItem.deleted_by + ' (restored)'
          });
          break;
      }

      // Mark as restored
      await db.deleted_items.update(deletedId, {
        restored_at: new Date().toISOString(),
        restored_by: localStorage.getItem('username'),
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
      const deletedItem = await db.deleted_items.get(deletedId);
      if (!deletedItem) throw new Error('Deleted item not found');

      // Mark as confirmed (permanently deleted)
      await db.deleted_items.update(deletedId, {
        confirmed_at: new Date().toISOString(),
        confirmed_by: localStorage.getItem('username')
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
      let query = db.deleted_items.orderBy('deleted_at').reverse();
      
      if (!showRestored) {
        query = query.filter(item => !item.restored_at && !item.confirmed_at);
      }
      
      return await query.toArray();
    } catch (error) {
      console.error('Error getting deleted items:', error);
      return [];
    }
  },

  // Get deleted items by entity type
  async getDeletedItemsByType(entityType, includeRestored = false) {
    try {
      let query = db.deleted_items
        .where('entity_type')
        .equals(entityType)
        .reverse();
      
      if (!includeRestored) {
        query = query.filter(item => !item.restored_at && !item.confirmed_at);
      }
      
      return await query.toArray();
    } catch (error) {
      console.error('Error getting deleted items by type:', error);
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
  }
};