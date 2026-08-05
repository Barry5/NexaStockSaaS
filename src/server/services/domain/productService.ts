import { BaseService } from './baseService.js';
import db from '../../database/db.js';
import { genId } from '../../utils/ids.js';

const PRODUCT_COLUMNS = [
  { sqlite: 'id', pg: 'legacy_id' },
  { sqlite: 'name', pg: 'name' },
  { sqlite: 'sku', pg: 'sku' },
  { sqlite: 'barcode', pg: 'barcode' },
  { sqlite: 'description', pg: 'description' },
  { sqlite: 'category', pg: 'category' },
  { sqlite: 'buyPrice', pg: 'buy_price' },
  { sqlite: 'sellPrice', pg: 'sell_price' },
  { sqlite: 'minPrice', pg: 'min_price' },
  { sqlite: 'quantity', pg: 'quantity' },
  { sqlite: 'alertThreshold', pg: 'alert_threshold' },
  { sqlite: 'image', pg: 'image' },
  { sqlite: 'tenantId', pg: 'tenant_id' },
  { sqlite: 'createdAt', pg: 'created_at' },
];

export class ProductService extends BaseService {
  constructor() {
    super('products', 'products', PRODUCT_COLUMNS);
  }

  getAll(tenantId: string): any[] {
    const rows = db.prepare(`
      SELECT p.*, GROUP_CONCAT(pv.id) as variantIds
      FROM products p
      LEFT JOIN product_variants pv ON pv.productId = p.id
      WHERE p.tenantId = ?
      GROUP BY p.id
      ORDER BY p.createdAt DESC
    `).all(tenantId) as any[];

    return rows.map(p => ({
      ...p,
      variants: this.getVariants(p.id),
    }));
  }

  getById(id: string): any | undefined {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as any | undefined;
    if (!product) return undefined;
    product.variants = this.getVariants(id);
    return product;
  }

  create(data: any, tenantId: string): any {
    const id = data.id || genId('p');
    const now = this.now();

    const product = {
      id,
      name: data.name,
      sku: data.sku,
      barcode: data.barcode || null,
      description: data.description || null,
      category: data.category,
      buyPrice: data.buyPrice,
      sellPrice: data.sellPrice,
      minPrice: data.minPrice ?? 0,
      quantity: data.quantity ?? 0,
      alertThreshold: data.alertThreshold ?? 5,
      image: data.image || null,
      tenantId,
      createdAt: now,
    };

    this.insertRaw(product);
    this.enqueueSync('CREATE', id, { ...product, legacy_id: id }, tenantId);

    return this.getById(id);
  }

  update(id: string, data: any, tenantId: string): any | null {
    const existing = db.prepare('SELECT * FROM products WHERE id = ? AND tenantId = ?').get(id, tenantId) as any | undefined;
    if (!existing) return null;

    const updated = {
      name: data.name ?? existing.name,
      sku: data.sku ?? existing.sku,
      barcode: data.barcode !== undefined ? data.barcode : existing.barcode,
      description: data.description !== undefined ? data.description : existing.description,
      category: data.category ?? existing.category,
      buyPrice: data.buyPrice ?? existing.buyPrice,
      sellPrice: data.sellPrice ?? existing.sellPrice,
      minPrice: data.minPrice ?? existing.minPrice,
      quantity: data.quantity ?? existing.quantity,
      alertThreshold: data.alertThreshold ?? existing.alertThreshold,
      image: data.image !== undefined ? data.image : existing.image,
    };

    this.updateRaw(id, updated);
    this.enqueueSync('UPDATE', id, { ...existing, ...updated, legacy_id: id }, tenantId);

    return this.getById(id);
  }

  delete(id: string, tenantId: string): boolean {
    const existing = db.prepare('SELECT * FROM products WHERE id = ? AND tenantId = ?').get(id, tenantId);
    if (!existing) return false;
    this.deleteRaw(id);
    this.enqueueSync('DELETE', id, existing as any, tenantId);
    return true;
  }

  private getVariants(productId: string): any[] {
    return db.prepare('SELECT * FROM product_variants WHERE productId = ?').all(productId) as any[];
  }
}

export const productService = new ProductService();
