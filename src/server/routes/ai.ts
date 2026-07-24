import { Router, Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import db from '../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// Initialize Gemini Client
const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

// POST: AI-Powered Restock recommendation using Gemini
router.post('/restock', authenticateToken, async (req: AuthenticatedRequest, res: Response, next) => {
  if (!ai) {
    return res.status(500).json({
      error: 'Clé API Gemini non configurée sur le serveur. Veuillez la configurer dans la section Paramètres.'
    });
  }

  const tenantId = req.user!.tenantId;

  try {
    const tenantProducts = db.prepare('SELECT * FROM products WHERE tenantId = ?').all(tenantId) as any[];
    const tenantSales = db.prepare('SELECT * FROM sales WHERE tenantId = ?').all(tenantId) as any[];
    const tenantSuppliers = db.prepare('SELECT * FROM suppliers WHERE tenantId = ?').all(tenantId) as any[];
    const activeTenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId) as any;

    if (!activeTenant) {
      return res.status(404).json({ error: 'Organisation non trouvée.' });
    }

    // Prepare information for Gemini
    const stockStatus = tenantProducts.map(p => ({
      name: p.name,
      category: p.category,
      quantity: p.quantity,
      threshold: p.alertThreshold,
      buyPrice: p.buyPrice,
      sellPrice: p.sellPrice,
      needsRestock: p.quantity <= p.alertThreshold,
    }));

    // Calculate velocity of products based on sales
    const salesFrequency: Record<string, number> = {};
    for (const sale of tenantSales) {
      const items = db.prepare('SELECT * FROM sale_items WHERE saleId = ?').all(sale.id) as any[];
      items.forEach(it => {
        salesFrequency[it.productName] = (salesFrequency[it.productName] || 0) + it.quantity;
      });
    }

    const suppliersList = tenantSuppliers.map(s => `${s.name} (${s.contactName} - ${s.email})`).join(', ');

    const prompt = `
Vous êtes un consultant expert en gestion de stocks et approvisionnement intelligent pour un SaaS commercial Premium.
Analysez la situation des stocks de l'entreprise suivante et proposez un rapport d'approvisionnement stratégique complet.

Nom de l'entreprise : ${activeTenant.name} (${activeTenant.description || 'N/A'})
Plan d'abonnement : ${activeTenant.plan}
Devise : ${activeTenant.currency}

Liste de tous les produits en stock (avec alertes) :
${JSON.stringify(stockStatus, null, 2)}

Volume de ventes récent par produit :
${JSON.stringify(salesFrequency, null, 2)}

Fournisseurs disponibles :
${suppliersList || "Aucun fournisseur enregistré pour l'instant."}

Votre rapport doit obligatoirement être structuré au format JSON respectant strictement le schéma suivant :
{
  "summary": "Résumé de l'état général des stocks et des risques d'interruption de vente en 3-4 phrases en français.",
  "alertsCount": 4, // Nombre d'articles critiques nécessitant un réapprovisionnement immédiat
  "recommendations": [
    {
      "productName": "Nom du produit",
      "currentStock": 3,
      "recommendedQuantity": 15,
      "estimatedCost": 16500, // recommandé * buyPrice
      "priority": "Haute" | "Moyenne" | "Faible",
      "reasoning": "Raison détaillée de la recommandation (ex: vitesse de vente élevée, rupture imminente, marge bénéficiaire importante)."
    }
  ],
  "smartTips": [
    "Conseil d'optimisation financière 1 (trésorerie libérée, négociations, gestion des dettes)",
    "Conseil d'optimisation financière 2"
  ]
}

Répondez EXCLUSIVEMENT en JSON valide. Ne mettez aucun texte explicatif en dehors du JSON.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            alertsCount: { type: Type.INTEGER },
            recommendations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  productName: { type: Type.STRING },
                  currentStock: { type: Type.INTEGER },
                  recommendedQuantity: { type: Type.INTEGER },
                  estimatedCost: { type: Type.NUMBER },
                  priority: { type: Type.STRING },
                  reasoning: { type: Type.STRING }
                },
                required: ['productName', 'currentStock', 'recommendedQuantity', 'estimatedCost', 'priority', 'reasoning']
              }
            },
            smartTips: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ['summary', 'alertsCount', 'recommendations', 'smartTips']
        }
      }
    });

    const text = response.text || '';
    const cleanJson = text.trim();
    const result = JSON.parse(cleanJson);
    res.json(result);

  } catch (error: any) {
    console.error('AI Restock error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
