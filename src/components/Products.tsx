import { useState, useMemo, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Package, MapPin, ArrowLeftRight, Layers } from 'lucide-react';
import type { Product, Warehouse, StockTransfer, ProductVariant } from '../types';
import { useDB, useApp } from '../context';
import { getTenantPlanStatus } from '../lib/subscriptionUtils.js';
import { IMAGE_PRESETS } from './products/ProductFormModal';
import { productSchema } from '../lib/validation';
import ProductsCatalog from './products/ProductsCatalog';
import ProductsWarehouses from './products/ProductsWarehouses';
import ProductsTransfers from './products/ProductsTransfers';
import ProductsVariants from './products/ProductsVariants';
import ProductFormModal from './products/ProductFormModal';
import WarehouseFormModal from './products/WarehouseFormModal';
import TransferFormModal from './products/TransferFormModal';
import VariantFormModal from './products/VariantFormModal';
import BarcodeScannerModal from './products/BarcodeScannerModal';
import CategoryManagerModal from './products/CategoryManagerModal';
import { ConfirmDialog } from './shared/ConfirmDialog';

export default function Products() {
  const { db, handleUpdateDb } = useDB();
  const { activeTenantId } = useApp();

  const activeTenant = useMemo(() => db.tenants.find(t => t.id === activeTenantId), [db.tenants, activeTenantId]);

  const planStatus = useMemo(() => {
    if (!activeTenant) return null;
    return getTenantPlanStatus(activeTenant, db);
  }, [activeTenant, db]);

  const [activeSubView, setActiveSubView] = useState<'catalog' | 'warehouses' | 'transfers' | 'variants'>('catalog');

  const tenantProducts = useMemo(() => {
    return db.products.filter(p => p.tenantId === activeTenantId);
  }, [db.products, activeTenantId]);

  const tenantWarehouses = useMemo(() => {
    return (db.warehouses || []).filter(w => w.tenantId === activeTenantId);
  }, [db.warehouses, activeTenantId]);

  const tenantTransfers = useMemo(() => {
    return (db.transfers || []).filter(t => t.tenantId === activeTenantId);
  }, [db.transfers, activeTenantId]);

  const tenantVariants = useMemo(() => {
    const productIds = tenantProducts.map(p => p.id);
    return (db.variants || []).filter(v => productIds.includes(v.productId));
  }, [db.variants, tenantProducts]);

  const categories = useMemo(() => {
    const cats = new Set(tenantProducts.map(p => p.category));
    const merged = Array.from(cats);
    if (activeTenant?.customCategories) {
      activeTenant.customCategories.forEach(cat => {
        const trimmedCat = cat.trim();
        if (trimmedCat && !merged.includes(trimmedCat)) {
          merged.push(trimmedCat);
        }
      });
    }
    return ['Tous', ...merged];
  }, [tenantProducts, activeTenant]);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [deleteProductId, setDeleteProductId] = useState<string | null>(null);

  const handleAddCustomCategory = (catName: string) => {
    const cleaned = catName.trim();
    if (!cleaned) return;
    const currentCats = activeTenant?.customCategories || [];
    if (currentCats.includes(cleaned)) {
      alert("Cette catégorie existe déjà !");
      return;
    }
    const updatedTenant = {
      ...activeTenant!,
      customCategories: [...currentCats, cleaned]
    };
    if (handleUpdateDb) {
      handleUpdateDb({
        ...db,
        tenants: db.tenants.map(t => t.id === activeTenantId ? updatedTenant : t)
      });
    }
    setNewCategoryName('');
  };

  const handleRemoveCustomCategory = (catName: string) => {
    const currentCats = activeTenant?.customCategories || [];
    const updatedTenant = {
      ...activeTenant!,
      customCategories: currentCats.filter(c => c !== catName)
    };
    if (handleUpdateDb) {
      handleUpdateDb({
        ...db,
        tenants: db.tenants.map(t => t.id === activeTenantId ? updatedTenant : t)
      });
    }
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tous');
  const [filterAlerts, setFilterAlerts] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showBarcodeScannerSim, setShowBarcodeScannerSim] = useState(false);
  const [scannedCode, setScannedCode] = useState('');

  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);
  const [warehouseName, setWarehouseName] = useState('');
  const [warehouseLocation, setWarehouseLocation] = useState('');

  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [transferQty, setTransferQty] = useState(1);

  const [isVariantModalOpen, setIsVariantModalOpen] = useState(false);
  const [variantProductId, setVariantProductId] = useState('');
  const [variantName, setVariantName] = useState('');
  const [variantSku, setVariantSku] = useState('');
  const [variantQty, setVariantQty] = useState(5);
  const [priceDelta, setPriceDelta] = useState(0);

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    barcode: '',
    description: '',
    category: '',
    buyPrice: 0,
    sellPrice: 0,
    quantity: 0,
    alertThreshold: 5,
    image: IMAGE_PRESETS[0].url
  });

  const handleOpenCreate = () => {
    if (planStatus?.products.isLimitReached) {
      alert(`Limite de produits de votre forfait atteinte (${planStatus.products.current} / ${planStatus.products.max} max). Veuillez mettre à jour votre abonnement dans l'onglet Paramètres.`);
      return;
    }
    setEditingProduct(null);
    setFormErrors({});
    const randId = Math.floor(Math.random() * 900000) + 100000;
    setFormData({
      name: '',
      sku: `PROD-${randId}`,
      barcode: `333${randId}999`,
      description: '',
      category: tenantProducts[0]?.category || 'Général',
      buyPrice: 0,
      sellPrice: 0,
      quantity: 10,
      alertThreshold: 5,
      image: IMAGE_PRESETS[0].url
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (prod: Product) => {
    setEditingProduct(prod);
    setFormErrors({});
    setFormData({
      name: prod.name,
      sku: prod.sku,
      barcode: prod.barcode,
      description: prod.description || '',
      category: prod.category,
      buyPrice: prod.buyPrice,
      sellPrice: prod.sellPrice,
      quantity: prod.quantity,
      alertThreshold: prod.alertThreshold,
      image: prod.image || IMAGE_PRESETS[0].url
    });
    setIsModalOpen(true);
  };

  const handleDelete = (productId: string) => {
    setDeleteProductId(productId);
  };

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    const productResult = productSchema.safeParse(formData);
    if (!productResult.success) {
      const errs: Record<string, string> = {};
      for (const issue of productResult.error.issues) {
        const path = issue.path.join('.');
        if (!errs[path]) errs[path] = issue.message;
      }
      setFormErrors(errs);
      return;
    }
    setFormErrors({});

    let updatedProducts: Product[] = [];

    if (editingProduct) {
      updatedProducts = db.products.map(p => {
        if (p.id === editingProduct.id) {
          return {
            ...p,
            name: formData.name,
            sku: formData.sku,
            barcode: formData.barcode,
            description: formData.description,
            category: formData.category,
            buyPrice: Number(formData.buyPrice),
            sellPrice: Number(formData.sellPrice),
            quantity: Number(formData.quantity),
            alertThreshold: Number(formData.alertThreshold),
            image: formData.image
          };
        }
        return p;
      });
    } else {
      const newProduct: Product = {
        id: `p-${Date.now()}`,
        name: formData.name,
        sku: formData.sku,
        barcode: formData.barcode,
        description: formData.description,
        category: formData.category,
        buyPrice: Number(formData.buyPrice),
        sellPrice: Number(formData.sellPrice),
        quantity: Number(formData.quantity),
        alertThreshold: Number(formData.alertThreshold),
        image: formData.image,
        tenantId: activeTenantId,
        createdAt: new Date().toISOString()
      };
      updatedProducts = [...db.products, newProduct];
    }

    const enteredCategory = formData.category.trim();
    let updatedTenants = db.tenants;
    if (enteredCategory) {
      const currentCats = activeTenant?.customCategories || [];
      if (!currentCats.includes(enteredCategory)) {
        updatedTenants = db.tenants.map(t => {
          if (t.id === activeTenantId) {
            return {
              ...t,
              customCategories: [...currentCats, enteredCategory]
            };
          }
          return t;
        });
      }
    }

    if (handleUpdateDb) {
      handleUpdateDb({
        ...db,
        products: updatedProducts,
        tenants: updatedTenants
      });
    } else {
      handleUpdateDb({ ...db, products: updatedProducts });
    }
    setIsModalOpen(false);
  };

  const handleSaveWarehouse = (e: FormEvent) => {
    e.preventDefault();
    if (!warehouseName) return;

    const newWarehouse: Warehouse = {
      id: `w-${Date.now()}`,
      name: warehouseName,
      location: warehouseLocation,
      tenantId: activeTenantId
    };

    if (handleUpdateDb) {
      handleUpdateDb({
        ...db,
        warehouses: [...(db.warehouses || []), newWarehouse]
      });
    }
    setWarehouseName('');
    setWarehouseLocation('');
    setIsWarehouseModalOpen(false);
  };

  const handleSaveVariant = (e: FormEvent) => {
    e.preventDefault();
    if (!variantProductId || !variantName) return;

    const newVariant: ProductVariant = {
      id: `v-${Date.now()}`,
      productId: variantProductId,
      name: variantName,
      sku: variantSku || `V-${Math.floor(Math.random() * 90000)}`,
      quantity: variantQty,
      priceDelta: Number(priceDelta)
    };

    if (handleUpdateDb) {
      handleUpdateDb({
        ...db,
        variants: [...(db.variants || []), newVariant]
      });
    }
    setVariantProductId('');
    setVariantName('');
    setVariantSku('');
    setVariantQty(5);
    setPriceDelta(0);
    setIsVariantModalOpen(false);
  };

  const handleSaveTransfer = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !fromWarehouseId || !toWarehouseId) return;
    if (fromWarehouseId === toWarehouseId) {
      alert("L'entrepôt de départ et d'arrivée doivent être différents.");
      return;
    }

    const product = tenantProducts.find(p => p.id === selectedProductId);
    if (!product) return;

    if (product.quantity < transferQty) {
      alert(`Quantité de stock insuffisante dans le catalogue (${product.quantity} disponibles).`);
      return;
    }

    const nextProducts = db.products.map(p => {
      if (p.id === selectedProductId) {
        return {
          ...p,
          quantity: Math.max(0, p.quantity - transferQty)
        };
      }
      return p;
    });

    const newTransfer: StockTransfer = {
      id: `tr-${Date.now()}`,
      productId: selectedProductId,
      productName: product.name,
      fromWarehouseId,
      toWarehouseId,
      quantity: transferQty,
      date: new Date().toISOString().split('T')[0],
      status: 'termine',
      tenantId: activeTenantId
    };

    if (handleUpdateDb) {
      handleUpdateDb({
        ...db,
        products: nextProducts,
        transfers: [...(db.transfers || []), newTransfer]
      });
    } else {
      handleUpdateDb({ ...db, products: nextProducts });
    }

    setIsTransferModalOpen(false);
    alert('Transfert de stock initié et complété avec succès !');
  };

  const handleScanSimulation = (code: string) => {
    setSearchTerm(code);
    setScannedCode(code);
    setShowBarcodeScannerSim(false);
    setTimeout(() => setScannedCode(''), 3000);
  };

  return (
    <div className="space-y-6">

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold font-display text-white">Gestion des Stocks & Logistique</h1>
          <p className="text-xs text-gray-400">Pilotez votre catalogue multi-entrepôts et vos variantes d'articles</p>
        </div>

        <div className="flex flex-wrap gap-1.5 bg-gray-900 p-1 rounded-xl border border-gray-850 self-stretch sm:self-auto">
          <button
            onClick={() => setActiveSubView('catalog')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeSubView === 'catalog' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-850'
            }`}
          >
            <Package className="w-3.5 h-3.5" /> Catalogue
          </button>
          <button
            onClick={() => setActiveSubView('warehouses')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeSubView === 'warehouses' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-850'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" /> Multi-Boutiques ({tenantWarehouses.length})
          </button>
          <button
            onClick={() => setActiveSubView('transfers')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeSubView === 'transfers' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-850'
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" /> Transferts & Log ({tenantTransfers.length})
          </button>
          <button
            onClick={() => setActiveSubView('variants')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeSubView === 'variants' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-850'
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> Attributs & Variantes ({tenantVariants.length})
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeSubView === 'catalog' && (
          <ProductsCatalog
            key="catalog"
            tenantProducts={tenantProducts}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            filterAlerts={filterAlerts}
            setFilterAlerts={setFilterAlerts}
            categories={categories}
            planName={planStatus?.planName || ''}
            productCount={planStatus?.products.current || 0}
            productLimit={planStatus?.products.max ?? null}
            currency={activeTenant?.currency || 'EUR'}
            onOpenCreate={handleOpenCreate}
            onOpenEdit={handleOpenEdit}
            onDelete={handleDelete}
            onOpenBarcodeScanner={() => setShowBarcodeScannerSim(true)}
            onOpenCategoryManager={() => setIsCategoryModalOpen(true)}
            scannedCode={scannedCode}
          />
        )}
        {activeSubView === 'warehouses' && (
          <ProductsWarehouses
            key="warehouses"
            tenantWarehouses={tenantWarehouses}
            organizationName={activeTenant?.name || ''}
            onCreateWarehouse={() => setIsWarehouseModalOpen(true)}
          />
        )}
        {activeSubView === 'transfers' && (
          <ProductsTransfers
            key="transfers"
            tenantTransfers={tenantTransfers}
            tenantWarehouses={tenantWarehouses}
            tenantProducts={tenantProducts}
            onCreateTransfer={() => {
              if (tenantWarehouses.length < 2) {
                alert("Vous devez configurer au moins 2 entrepôts/boutiques pour effectuer des transferts.");
                return;
              }
              setIsTransferModalOpen(true);
            }}
          />
        )}
        {activeSubView === 'variants' && (
          <ProductsVariants
            key="variants"
            tenantVariants={tenantVariants}
            tenantProducts={tenantProducts}
            onCreateVariant={() => {
              if (tenantProducts.length === 0) {
                alert("Créez d'abord des produits standards dans le catalogue.");
                return;
              }
              setIsVariantModalOpen(true);
            }}
          />
        )}
      </AnimatePresence>

      <ProductFormModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setFormErrors({}); }}
        onSave={handleSave}
        editingProduct={editingProduct}
        formData={formData}
        setFormData={setFormData}
        categories={categories}
        onAddCustomCategory={handleAddCustomCategory}
        currency={activeTenant?.currency || 'EUR'}
        errors={formErrors}
        onClearError={(field) => setFormErrors(prev => { const n = {...prev}; delete n[field]; return n; })}
      />

      <WarehouseFormModal
        isOpen={isWarehouseModalOpen}
        onClose={() => setIsWarehouseModalOpen(false)}
        onSave={handleSaveWarehouse}
        warehouseName={warehouseName}
        setWarehouseName={setWarehouseName}
        warehouseLocation={warehouseLocation}
        setWarehouseLocation={setWarehouseLocation}
      />

      <TransferFormModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        onSave={handleSaveTransfer}
        tenantProducts={tenantProducts}
        tenantWarehouses={tenantWarehouses}
        selectedProductId={selectedProductId}
        setSelectedProductId={setSelectedProductId}
        fromWarehouseId={fromWarehouseId}
        setFromWarehouseId={setFromWarehouseId}
        toWarehouseId={toWarehouseId}
        setToWarehouseId={setToWarehouseId}
        transferQty={transferQty}
        setTransferQty={setTransferQty}
      />

      <VariantFormModal
        isOpen={isVariantModalOpen}
        onClose={() => setIsVariantModalOpen(false)}
        onSave={handleSaveVariant}
        tenantProducts={tenantProducts}
        variantProductId={variantProductId}
        setVariantProductId={setVariantProductId}
        variantName={variantName}
        setVariantName={setVariantName}
        variantSku={variantSku}
        setVariantSku={setVariantSku}
        variantQty={variantQty}
        setVariantQty={setVariantQty}
        priceDelta={priceDelta}
        setPriceDelta={setPriceDelta}
      />

      <BarcodeScannerModal
        isOpen={showBarcodeScannerSim}
        onClose={() => setShowBarcodeScannerSim(false)}
        tenantProducts={tenantProducts}
        onScan={handleScanSimulation}
      />

      <CategoryManagerModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={categories}
        tenantCategories={activeTenant?.customCategories || []}
        onAddCustomCategory={handleAddCustomCategory}
        onRemoveCustomCategory={handleRemoveCustomCategory}
      />

      <ConfirmDialog
        isOpen={deleteProductId !== null}
        title="Confirmation"
        message="Voulez-vous vraiment supprimer ce produit de l'inventaire ?"
        confirmLabel="Supprimer"
        onConfirm={() => {
          const updatedProducts = db.products.filter(p => p.id !== deleteProductId);
          if (handleUpdateDb) {
            handleUpdateDb({ ...db, products: updatedProducts });
          } else {
            handleUpdateDb({ ...db, products: updatedProducts });
          }
          setDeleteProductId(null);
        }}
        onCancel={() => setDeleteProductId(null)}
      />
    </div>
  );
}
