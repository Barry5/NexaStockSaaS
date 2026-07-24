import { Router, Response } from 'express';
import db from '../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { productSchema } from '../schemas/index.js';

const router = Router();

// GET: List all products for the tenant
router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const products = db.prepare('SELECT * FROM products WHERE tenantId = ?').all(tenantId) as any[];
    
    // Fetch variants for each product
    const productsWithVariants = products.map(p => {
      const variants = db.prepare('SELECT * FROM product_variants WHERE productId = ?').all(p.id);
      return {
        ...p,
        variants
      };
    });

    res.json(productsWithVariants);
  } catch (error) {
    next(error);
  }
});

// POST: Add new product
router.post('/', authenticateToken, validate(productSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { name, sku, barcode, description, category, buyPrice, sellPrice, quantity, alertThreshold, image } = req.body;
    const id = req.body.id || `p-${Math.floor(Math.random() * 90000 + 10000)}`;
    const createdAt = new Date().toISOString();

    db.prepare(`
      INSERT INTO products (id, name, sku, barcode, description, category, buyPrice, sellPrice, quantity, alertThreshold, image, tenantId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, sku, barcode || null, description || null, category, buyPrice, sellPrice, quantity, alertThreshold, image || null, tenantId, createdAt);

    const newProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    res.status(201).json(newProduct);
  } catch (error) {
    next(error);
  }
});

// PUT: Update a product
router.put('/:id', authenticateToken, validate(productSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { name, sku, barcode, description, category, buyPrice, sellPrice, quantity, alertThreshold, image } = req.body;

    // Confirm product exists and belongs to the active tenant
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND tenantId = ?').get(id, tenantId);
    if (!product) {
      return res.status(404).json({ error: 'Produit introuvable dans votre boutique.' });
    }

    db.prepare(`
      UPDATE products 
      SET name = ?, sku = ?, barcode = ?, description = ?, category = ?, buyPrice = ?, sellPrice = ?, quantity = ?, alertThreshold = ?, image = ?
      WHERE id = ? AND tenantId = ?
    `).run(name, sku, barcode || null, description || null, category, buyPrice, sellPrice, quantity, alertThreshold, image || null, id, tenantId);

    const updatedProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    res.json(updatedProduct);
  } catch (error) {
    next(error);
  }
});

// DELETE: Remove a product
router.delete('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    // Confirm ownership
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND tenantId = ?').get(id, tenantId);
    if (!product) {
      return res.status(404).json({ error: 'Produit introuvable dans votre boutique.' });
    }

    db.prepare('DELETE FROM products WHERE id = ? AND tenantId = ?').run(id, tenantId);
    res.json({ success: true, message: 'Le produit a été supprimé avec succès.' });
  } catch (error) {
    next(error);
  }
});

export default router;
