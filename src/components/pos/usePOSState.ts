import { useState, useMemo, useEffect, type FormEvent } from 'react';
import { jsPDF } from 'jspdf';
import type { Product, Sale, Customer, PaymentMethod, SaleItem, PaymentHistoryItem } from '../../types';
import { useDB, useApp } from '../../context';
import { getTenantPlanStatus } from '../../lib/subscriptionUtils.js';
import { formatPDFNum, type POSTab } from './posUtils';
import { filterSalesHistory } from '../../services/posHistory';
import { buildSaleItems, calculateCheckoutTotals, createInstallments } from '../../services/posCheckout';

export function usePOSState() {
  const { db, handleAddSale, handleUpdateDb, addNotification } = useDB();
  const { activeTenantId } = useApp();
  const [activeTab, setActiveTab] = useState<POSTab>('vente');

  // Tenant Details
  const activeTenant = useMemo(() => db.tenants.find(t => t.id === activeTenantId), [db.tenants, activeTenantId]);
  const currency = activeTenant?.currency || 'FCFA';

  const planStatus = useMemo(() => {
    if (!activeTenant) return null;
    return getTenantPlanStatus(activeTenant, db);
  }, [activeTenant, db]);

  const currentCashier = useMemo(() => {
    return db.users.find(u => u.tenantId === activeTenantId) || { id: 'u-1', name: 'Barry Hassim' };
  }, [db.users, activeTenantId]);

  const tenantProducts = useMemo(() => {
    return db.products.filter(p => p.tenantId === activeTenantId);
  }, [db.products, activeTenantId]);

  const tenantCustomers = useMemo(() => {
    return db.customers.filter(c => c.tenantId === activeTenantId);
  }, [db.customers, activeTenantId]);

  const salesHistory = useMemo(() => {
    return (db.sales || []).filter(s => s.tenantId === activeTenantId);
  }, [db.sales, activeTenantId]);

  // --- TAB 1: COOP POS STATE ---
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tous');
  const [barcodeInput, setBarcodeInput] = useState('');
  
  const [cart, setCart] = useState<{ 
    product: Product; 
    quantity: number; 
    negotiatedPrice: number; 
    lineDiscount: number; 
  }[]>([]);

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [globalDiscountType, setGlobalDiscountType] = useState<'fixed' | 'percent'>('fixed');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('especes');
  const [saleType, setSaleType] = useState<'standard' | 'ticket' | 'facture'>('standard');
  const [checkoutInvoiceStatus, setCheckoutInvoiceStatus] = useState<'Brouillon' | 'Validée'>('Validée');
  const [checkoutDeliveryStatus, setCheckoutDeliveryStatus] = useState<'livre_total' | 'non_livre'>('livre_total');
  const [extraFees, setExtraFees] = useState(0);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [taxStamp, setTaxStamp] = useState(0);
  const [customFeeLabel, setCustomFeeLabel] = useState('Frais de transport');
  const [deliveryStatus, setDeliveryStatus] = useState<'livré' | 'non_livré'>('livré');
  const [amountPaid, setAmountPaid] = useState<number>(0);

  // Credit Sales States
  const [creditDueDate, setCreditDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [installmentsCount, setInstallmentsCount] = useState(2);

  // Quick Customer Form
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');

  // Modals & Receipts
  const [generatedSale, setGeneratedSale] = useState<Sale | null>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [previewReceiptFormat, setPreviewReceiptFormat] = useState<'58mm' | '80mm' | 'A4'>('80mm');
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareChannel, setShareChannel] = useState<'whatsapp' | 'email'>('whatsapp');
  const [shareContactValue, setShareContactValue] = useState('');
  
  // Sidebar record payment state
  const [sidebarPayAmount, setSidebarPayAmount] = useState<number>(0);
  const [sidebarPayMethod, setSidebarPayMethod] = useState<string>('especes');
  const [sidebarPayRef, setSidebarPayRef] = useState<string>('');

  // Tenant Configuration settings fields state
  const [tenantName, setTenantName] = useState('');
  const [tenantCurrency, setTenantCurrency] = useState('');
  const [invoicePrefix, setInvoicePrefix] = useState('');
  const [invoiceFooterMsg, setInvoiceFooterMsg] = useState('');
  const [invoiceSubFooterMsg, setInvoiceSubFooterMsg] = useState('');
  const [defaultExtraFeeLabel, setDefaultExtraFeeLabel] = useState('');

  useEffect(() => {
    if (activeTenant) {
      setTenantName(activeTenant.name || '');
      setTenantCurrency(activeTenant.currency || 'FCFA');
      setInvoicePrefix((activeTenant as any).invoicePrefix || 'FAC-');
      setInvoiceFooterMsg((activeTenant as any).invoiceFooterMsg || 'MERCI DE VOTRE CONFIANCE !');
      setInvoiceSubFooterMsg((activeTenant as any).invoiceSubFooterMsg || 'NexaStock ERP Multi-tenant - Document officiel au format PDF');
      setDefaultExtraFeeLabel((activeTenant as any).defaultExtraFeeLabel || 'Frais de transport');
    }
  }, [activeTenant]);

  const handleSaveTenantConfig = () => {
    if (!tenantName.trim()) {
      alert("Le nom de l'organisation ne peut pas être vide.");
      return;
    }

    const updatedTenants = db.tenants.map(t => {
      if (t.id === activeTenantId) {
        return {
          ...t,
          name: tenantName,
          currency: tenantCurrency,
          invoicePrefix: invoicePrefix,
          invoiceFooterMsg: invoiceFooterMsg,
          invoiceSubFooterMsg: invoiceSubFooterMsg,
          defaultExtraFeeLabel: defaultExtraFeeLabel
        };
      }
      return t;
    });

    const nextDb = { ...db, tenants: updatedTenants };
    handleUpdateDb(nextDb);
    alert("Configuration de facturation enregistrée avec succès !");
  };

  // Extract unique categories
  const categories = useMemo(() => {
    const cats = new Set(tenantProducts.map(p => p.category));
    return ['Tous', ...Array.from(cats)];
  }, [tenantProducts]);

  // Filter products for clicking grid
  const filteredProducts = useMemo(() => {
    return tenantProducts.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            p.barcode.includes(searchTerm) || 
                            p.sku.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'Tous' || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [tenantProducts, searchTerm, selectedCategory]);

  // Handle Quick Barcode Scanner submission
  const handleBarcodeSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    const found = tenantProducts.find(p => p.barcode === barcodeInput.trim());
    if (found) {
      addProductToCart(found);
      setBarcodeInput('');
    } else {
      alert(`Aucun produit trouvé avec le code-barres : ${barcodeInput}`);
    }
  };

  // Cart Operations
  const addProductToCart = (product: Product) => {
    const existing = cart.find(item => item.product.id === product.id);
    if (existing) {
      if (existing.quantity >= product.quantity) {
        alert(`Stock insuffisant. Seulement ${product.quantity} disponibles.`);
        return;
      }
      setCart(cart.map(item => 
        item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      setCart([...cart, { 
        product, 
        quantity: 1, 
        negotiatedPrice: product.sellPrice, 
        lineDiscount: 0 
      }]);
    }
  };

  const updateCartQty = (productId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.product.id === productId) {
        const nextQ = item.quantity + delta;
        if (nextQ <= 0) return null;
        if (nextQ > item.product.quantity) {
          alert(`Stock insuffisant. Stock disponible : ${item.product.quantity}`);
          return item;
        }
        return { ...item, quantity: nextQ };
      }
      return item;
    }).filter(Boolean) as any);
  };

  const updateLinePrice = (productId: string, newPrice: number) => {
    setCart(cart.map(item => {
      if (item.product.id === productId) {
        return { ...item, negotiatedPrice: Math.max(0, newPrice) };
      }
      return item;
    }));
  };

  const updateLineDiscount = (productId: string, discount: number) => {
    setCart(cart.map(item => {
      if (item.product.id === productId) {
        return { ...item, lineDiscount: Math.max(0, discount) };
      }
      return item;
    }));
  };

  const removeCartItem = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  // Calculations
  const taxRate = activeTenant?.taxRate !== undefined ? activeTenant.taxRate : 18;
  const checkoutTotals = useMemo(() => {
    return calculateCheckoutTotals(cart, globalDiscount, globalDiscountType, taxRate, extraFees, paymentMethod, amountPaid);
  }, [cart, globalDiscount, globalDiscountType, taxRate, extraFees, paymentMethod, amountPaid]);

  const cartSubtotal = checkoutTotals.cartSubtotal;
  const subtotalDiscount = checkoutTotals.subtotalDiscount;
  const computedTax = checkoutTotals.computedTax;
  const orderTotal = checkoutTotals.orderTotal;
  const remainingBalance = checkoutTotals.remainingBalance;
  const changeReturned = checkoutTotals.changeReturned;

  // Auto set recommended amount paid
  useEffect(() => {
    if (paymentMethod !== 'credit') {
      setAmountPaid(orderTotal);
    } else {
      setAmountPaid(Math.round(orderTotal * 0.3));
    }
  }, [orderTotal, paymentMethod]);

  const handleQuickCreateCustomer = (e: FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) return;

    const newCust: Customer = {
      id: `c-${Date.now()}`,
      name: newCustName,
      phone: newCustPhone,
      email: newCustEmail,
      loyaltyPoints: 0,
      outstandingDebt: 0,
      tenantId: activeTenantId,
      createdAt: new Date().toISOString()
    };

    db.customers.push(newCust);
    setSelectedCustomerId(newCust.id);
    setIsAddCustomerOpen(false);
    
    setNewCustName('');
    setNewCustPhone('');
    setNewCustEmail('');
  };

  // Perform checkout
  const handleCheckout = () => {
    if (cart.length === 0) {
      alert('Votre panier est vide.');
      return;
    }

    if (planStatus?.sales.isLimitReached) {
      alert('La limite de transactions de ventes autorisée par votre forfait actuel est atteinte.');
      return;
    }

    const customerObj = tenantCustomers.find(c => c.id === selectedCustomerId);
    if (paymentMethod === 'credit' && !customerObj) {
      alert('Veuillez associer ou créer un client pour enregistrer une vente à crédit.');
      return;
    }

    const todayStr = new Date().toISOString();
    const invoiceNum = `${saleType === 'ticket' ? 'TK' : 'FAC'}-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const isBrouillon = checkoutInvoiceStatus === 'Brouillon';

    const saleItems: SaleItem[] = buildSaleItems(cart, isBrouillon, checkoutDeliveryStatus as 'livre_total' | 'non_livre');

    const installments: any[] = [];
    if (paymentMethod === 'credit' && remainingBalance > 0 && !isBrouillon) {
      installments.push(...createInstallments(remainingBalance, installmentsCount, creditDueDate));
    }

    const paymentsList: PaymentHistoryItem[] = [];
    let computedPaymentStatus: 'Non payé' | 'Partiellement payé' | 'Payé' | 'Remboursé' = 'Non payé';
    let computedCreditStatus: 'Pas de crédit' | 'Crédit actif' | 'Crédit en retard' | 'Crédit soldé' = 'Pas de crédit';

    if (!isBrouillon) {
      if (paymentMethod === 'credit') {
        if (amountPaid > 0) {
          paymentsList.push({
            id: `pay-${Date.now()}-init`,
            date: todayStr.split('T')[0],
            time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            amount: amountPaid,
            paymentMethod: paymentMethod,
            reference: `Acompte initial - ${invoiceNum}`,
            userName: currentCashier.name
          });
          computedPaymentStatus = amountPaid >= orderTotal ? 'Payé' : 'Partiellement payé';
        } else {
          computedPaymentStatus = 'Non payé';
        }
        computedCreditStatus = remainingBalance > 0 ? 'Crédit actif' : 'Crédit soldé';
      } else {
        paymentsList.push({
          id: `pay-${Date.now()}-init`,
          date: todayStr.split('T')[0],
          time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          amount: orderTotal,
          paymentMethod: paymentMethod,
          reference: `Paiement comptant - ${invoiceNum}`,
          userName: currentCashier.name
        });
        computedPaymentStatus = 'Payé';
        computedCreditStatus = 'Pas de crédit';
      }
    }

    const computedDeliveryStatus: 'Non livrée' | 'Partiellement livrée' | 'Livrée' | 'Retournée' = isBrouillon
      ? 'Non livrée'
      : (checkoutDeliveryStatus === 'livre_total' ? 'Livrée' : 'Non livrée');

    const finalSale: Sale = {
      id: `sa-${Date.now()}`,
      invoiceNumber: invoiceNum,
      date: todayStr,
      items: saleItems,
      subtotal: cartSubtotal,
      tax: computedTax,
      taxRate: taxRate,
      discount: subtotalDiscount,
      total: orderTotal,
      paymentMethod,
      customerId: customerObj?.id || undefined,
      customerName: customerObj?.name || 'Vente Comptoir',
      tenantId: activeTenantId,
      employeeId: currentCashier.id,
      employeeName: currentCashier.name,
      
      status: isBrouillon ? 'Brouillon' : (paymentMethod === 'credit' ? (amountPaid > 0 ? 'Partiellement payée' : 'En attente') : 'Payée'),
      creditDueDate: paymentMethod === 'credit' && !isBrouillon ? creditDueDate : undefined,
      creditPaidAmount: isBrouillon ? 0 : (paymentMethod === 'credit' ? amountPaid : orderTotal),
      creditInstallments: installments.length > 0 ? JSON.stringify(installments) : undefined,
      extraFees: Number(extraFees),
      deliveryFee: Number(deliveryFee),
      taxStamp: 0,
      changeReturned: changeReturned,
      saleType: saleType,
      isReturned: 0,
      customFeeLabel: extraFees > 0 ? customFeeLabel : undefined,
      abandonReason: undefined,

      invoiceStatus: checkoutInvoiceStatus,
      paymentStatus: computedPaymentStatus,
      deliveryStatus: computedDeliveryStatus,
      creditStatus: computedCreditStatus,
      payments: paymentsList,
      returns: [],
      creditComments: [],
      creditRelances: 0
    };

    const nextProducts = isBrouillon 
      ? db.products 
      : db.products.map(p => {
          const inCart = cart.find(c => c.product.id === p.id);
          if (inCart) {
            return {
              ...p,
              quantity: Math.max(0, p.quantity - inCart.quantity)
            };
          }
          return p;
        });

    const nextCustomers = db.customers.map(c => {
      if (c.id === selectedCustomerId) {
        const points = isBrouillon ? 0 : Math.floor(orderTotal / 100);
        const debtIncrease = (paymentMethod === 'credit' && !isBrouillon) ? remainingBalance : 0;
        return {
          ...c,
          loyaltyPoints: c.loyaltyPoints + points,
          outstandingDebt: c.outstandingDebt + debtIncrease
        };
      }
      return c;
    });

    handleAddSale(finalSale, nextProducts, nextCustomers);
    setGeneratedSale(finalSale);
    setCheckoutSuccess(true);

    setCart([]);
    setSelectedCustomerId('');
    setGlobalDiscount(0);
    setExtraFees(0);
    setDeliveryFee(0);
    setTaxStamp(0);
    setCustomFeeLabel('Frais de transport');
    setCheckoutInvoiceStatus('Validée');
    setCheckoutDeliveryStatus('livre_total');
  };

  // --- TAB 2: HISTORIQUE / DETAIL & RETOURS STATE ---
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilterStatus, setHistoryFilterStatus] = useState('Tous');
  const [selectedSaleDetail, setSelectedSaleDetail] = useState<any>(null);
  const activeSaleDetail = useMemo(() => {
    if (!selectedSaleDetail) return null;
    return db.sales.find(s => s.id === selectedSaleDetail.id) || selectedSaleDetail;
  }, [db.sales, selectedSaleDetail]);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState('');
  const [refundAmountInput, setRefundAmountInput] = useState(0);

  const filteredHistory = useMemo(() => {
    return filterSalesHistory(salesHistory, historySearch, historyFilterStatus);
  }, [salesHistory, historySearch, historyFilterStatus]);

  const convertToInvoice = (sale: any) => {
    const customerObj = tenantCustomers.find(c => c.id === selectedCustomerId);
    if (!customerObj) {
      addNotification("Veuillez sélectionner un client dans le sélecteur du POS pour lui attribuer cette facture officielle.", 'error');
      return;
    }

    const updatedSales = db.sales.map(s => {
      if (s.id === sale.id) {
        return {
          ...s,
          invoiceNumber: `FAC-${s.invoiceNumber.slice(3)}`,
          saleType: 'facture',
          customerId: customerObj.id,
          customerName: customerObj.name
        };
      }
      return s;
    });

    const nextDb = { ...db, sales: updatedSales };
    handleUpdateDb(nextDb);
    setSelectedSaleDetail({
      ...sale,
      invoiceNumber: `FAC-${sale.invoiceNumber.slice(3)}`,
      saleType: 'facture',
      customerId: customerObj.id,
      customerName: customerObj.name
    });
    addNotification("Vente convertie avec succès en facture officielle !");
  };

  const handleUpdateSaleState = (saleId: string, updates: Partial<any>, silent = false) => {
    const updatedSales = db.sales.map(s => {
      if (s.id === saleId) {
        return {
          ...s,
          ...updates
        };
      }
      return s;
    });

    const nextDb = { ...db, sales: updatedSales };
    handleUpdateDb(nextDb);

    setSelectedSaleDetail((prev: any) => {
      if (prev && prev.id === saleId) {
        return { ...prev, ...updates };
      }
      return prev;
    });
  };

  const handleUpdateSaleERPStatuses = (
    saleId: string, 
    newStatuses: { 
      invoiceStatus?: 'Brouillon' | 'Validée' | 'Annulée' | 'Archivée'; 
      paymentStatus?: 'Non payé' | 'Partiellement payé' | 'Payé' | 'Remboursé'; 
      deliveryStatus?: 'Non livrée' | 'Partiellement livrée' | 'Livrée' | 'Retournée'; 
      creditStatus?: 'Pas de crédit' | 'Crédit actif' | 'Crédit en retard' | 'Crédit soldé';
      payments?: any[];
      returns?: any[];
      creditPaidAmount?: number;
      abandonReason?: string;
    }
  ) => {
    const sale = db.sales.find(s => s.id === saleId);
    if (!sale) return;

    let updatedProducts = [...db.products];
    let updatedCustomers = [...db.customers];

    const prevInvoiceStatus = sale.invoiceStatus || 'Validée';
    const nextInvoiceStatus = newStatuses.invoiceStatus || prevInvoiceStatus;

    if (prevInvoiceStatus === 'Brouillon' && nextInvoiceStatus === 'Validée') {
      updatedProducts = updatedProducts.map(p => {
        const item = sale.items.find((it: any) => it.productId === p.id);
        if (item) {
          return { ...p, quantity: Math.max(0, p.quantity - item.quantity) };
        }
        return p;
      });
      updatedCustomers = updatedCustomers.map(c => {
        if (c.id === sale.customerId) {
          const points = Math.floor(sale.total / 100);
          const remainingBalance = Math.max(0, sale.total - (sale.creditPaidAmount || 0));
          const debtIncrease = sale.paymentMethod === 'credit' ? remainingBalance : 0;
          return {
            ...c,
            loyaltyPoints: c.loyaltyPoints + points,
            outstandingDebt: c.outstandingDebt + debtIncrease
          };
        }
        return c;
      });
    }

    if (prevInvoiceStatus === 'Validée' && nextInvoiceStatus === 'Annulée') {
      updatedProducts = updatedProducts.map(p => {
        const item = sale.items.find((it: any) => it.productId === p.id);
        if (item) {
          return { ...p, quantity: p.quantity + item.quantity };
        }
        return p;
      });
      updatedCustomers = updatedCustomers.map(c => {
        if (c.id === sale.customerId) {
          const remainingBalance = Math.max(0, sale.total - (sale.creditPaidAmount || 0));
          const debtDecrease = sale.paymentMethod === 'credit' ? remainingBalance : 0;
          return {
            ...c,
            outstandingDebt: Math.max(0, c.outstandingDebt - debtDecrease)
          };
        }
        return c;
      });
    }

    const updatedSales = db.sales.map(s => {
      if (s.id === saleId) {
        return {
          ...s,
          ...newStatuses,
          status: newStatuses.invoiceStatus === 'Annulée' ? 'Abandonnée' : (newStatuses.invoiceStatus === 'Brouillon' ? 'Brouillon' : (newStatuses.paymentStatus === 'Payé' ? 'Payée' : s.status))
        };
      }
      return s;
    });

    const nextDb = {
      ...db,
      products: updatedProducts,
      customers: updatedCustomers,
      sales: updatedSales
    };

    handleUpdateDb(nextDb);

    setSelectedSaleDetail((prev: any) => {
      if (prev && prev.id === saleId) {
        return {
          ...prev,
          ...newStatuses,
          status: newStatuses.invoiceStatus === 'Annulée' ? 'Abandonnée' : (newStatuses.invoiceStatus === 'Brouillon' ? 'Brouillon' : (newStatuses.paymentStatus === 'Payé' ? 'Payée' : prev.status))
        };
      }
      return prev;
    });
  };

  const handleRecordNewPayment = (saleId: string, amount: number, method: string, reference: string) => {
    const sale = db.sales.find(s => s.id === saleId);
    if (!sale) return;

    if (amount <= 0) {
      alert("Le montant du paiement doit être supérieur à 0.");
      return;
    }

    let paymentsList: PaymentHistoryItem[] = [];
    if (sale.payments) {
      paymentsList = typeof sale.payments === 'string' ? JSON.parse(sale.payments) : [...sale.payments];
    }

    const newPay: PaymentHistoryItem = {
      id: `pay-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      amount: amount,
      paymentMethod: method as any,
      reference: reference || 'Règlement d\'échéance',
      userName: currentCashier.name
    };

    paymentsList.push(newPay);

    const totalPaid = paymentsList.reduce((sum, p) => sum + p.amount, 0);
    const orderTotal = sale.total;

    let computedPaymentStatus: 'Non payé' | 'Partiellement payé' | 'Payé' | 'Remboursé' = 'Non payé';
    if (totalPaid === 0) computedPaymentStatus = 'Non payé';
    else if (totalPaid > 0 && totalPaid < orderTotal) computedPaymentStatus = 'Partiellement payé';
    else if (totalPaid >= orderTotal) computedPaymentStatus = 'Payé';

    let computedCreditStatus = sale.creditStatus || 'Pas de crédit';
    if (sale.paymentMethod === 'credit' || computedCreditStatus !== 'Pas de crédit') {
      computedCreditStatus = totalPaid >= orderTotal ? 'Crédit soldé' : 'Crédit actif';
    }

    const updatedCustomers = db.customers.map(c => {
      if (c.id === sale.customerId) {
        return {
          ...c,
          outstandingDebt: Math.max(0, c.outstandingDebt - amount)
        };
      }
      return c;
    });

    const updatedSales = db.sales.map(s => {
      if (s.id === saleId) {
        return {
          ...s,
          payments: paymentsList,
          paymentStatus: computedPaymentStatus,
          creditStatus: computedCreditStatus,
          creditPaidAmount: totalPaid
        };
      }
      return s;
    });

    handleUpdateDb({
      ...db,
      customers: updatedCustomers,
      sales: updatedSales
    });

    setSelectedSaleDetail((prev: any) => {
      if (prev && prev.id === saleId) {
        return {
          ...prev,
          payments: paymentsList,
          paymentStatus: computedPaymentStatus,
          creditStatus: computedCreditStatus,
          creditPaidAmount: totalPaid
        };
      }
      return prev;
    });

    alert("Règlement de " + amount.toLocaleString() + " " + currency + " enregistré avec succès !");
  };

  const handleRefaireFacture = (sale: any) => {
    const motif = prompt("Veuillez saisir le motif d'abandon pour l'ancienne facture (Obligatoire) :", "Remplacée par une nouvelle facture suite à modification de produits");
    if (motif === null) return;
    if (!motif.trim()) {
      alert("Le motif de l'abandon est obligatoire pour continuer.");
      return;
    }

    let updatedProducts = [...db.products];
    const prevInvoiceStatus = sale.invoiceStatus || 'Validée';
    if (prevInvoiceStatus === 'Validée') {
      updatedProducts = updatedProducts.map(p => {
        const item = sale.items.find((it: any) => it.productId === p.id);
        if (item) {
          return { ...p, quantity: p.quantity + item.quantity };
        }
        return p;
      });
    }

    const updatedSales = db.sales.map(s => {
      if (s.id === sale.id) {
        return {
          ...s,
          status: 'Abandonnée',
          invoiceStatus: 'Annulée' as const,
          abandonReason: motif
        };
      }
      return s;
    });

    const loadedCart = sale.items.map((it: any) => {
      const originalProd = db.products.find(p => p.id === it.productId);
      const productObj = originalProd || {
        id: it.productId,
        name: it.productName,
        sku: 'N/A',
        barcode: 'N/A',
        description: '',
        category: 'Tous',
        buyPrice: 0,
        sellPrice: it.price,
        quantity: 9999,
        alertThreshold: 0,
        tenantId: activeTenantId,
        createdAt: new Date().toISOString()
      };
      return {
        product: productObj,
        quantity: it.quantity,
        negotiatedPrice: it.price,
        lineDiscount: 0
      };
    });

    setCart(loadedCart);
    setSelectedCustomerId(sale.customerId || '');
    setGlobalDiscount(sale.discount || 0);
    setExtraFees(sale.extraFees || 0);
    setCustomFeeLabel(sale.customFeeLabel || 'Frais extra');
    setDeliveryStatus(sale.deliveryStatus || 'livré');
    setPaymentMethod(sale.paymentMethod || 'especes');

    const nextDb = { ...db, products: updatedProducts, sales: updatedSales };
    handleUpdateDb(nextDb);

    setSelectedSaleDetail(null);
    setActiveTab('vente');

    alert("L'ancienne facture a été marquée comme Abandonnée (Annulée) et son stock a été réintégré. Ses produits ont été rechargés dans votre panier de vente. Vous pouvez maintenant effectuer les modifications et enregistrer la nouvelle facture !");
  };

  const handleShareActualFile = async () => {
    if (!selectedSaleDetail) return;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(30, 58, 138);
    doc.text(activeTenant?.name || 'NexaStock', 20, 25);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(activeTenant?.address || 'Adresse non spécifiée', 20, 31);
    doc.text(`Tél: ${activeTenant?.phone || 'Non spécifié'}`, 20, 36);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(30, 58, 138);
    doc.text("FACTURE OFFICIELLE", 130, 25);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(50, 50, 50);
    doc.text(`Numéro: ${selectedSaleDetail.invoiceNumber}`, 130, 31);
    doc.text(`Date: ${new Date(selectedSaleDetail.date).toLocaleDateString('fr-FR')}`, 130, 36);

    doc.setDrawColor(59, 130, 246);
    doc.setLineWidth(0.8);
    doc.line(20, 42, 190, 42);

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(50, 50, 50);
    doc.text("ÉMETTEUR :", 20, 50);
    doc.setFont("helvetica", "normal");
    doc.text(activeTenant?.name || 'NexaStock', 20, 55);
    doc.text(`Caissier: ${selectedSaleDetail.employeeName}`, 20, 60);

    doc.setFont("helvetica", "bold");
    doc.text("DESTINATAIRE :", 110, 50);
    doc.setFont("helvetica", "normal");
    doc.text(selectedSaleDetail.customerName || 'Vente Comptoir', 110, 55);
    doc.text(`ID Client: ${selectedSaleDetail.customerId || 'Passager'}`, 110, 60);

    doc.setFillColor(243, 244, 246);
    doc.rect(20, 66, 170, 10, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30, 58, 138);
    const reglementStatus = selectedSaleDetail.status === 'Payée' || selectedSaleDetail.paymentMethod !== 'credit' ? 'TOTAL (Payé)' : selectedSaleDetail.status === 'Partiellement payée' ? 'PARTIEL' : 'NON PAYÉ';
    doc.text(`STATUT DE RÈGLEMENT : ${reglementStatus}`, 25, 72.5);

    doc.setFillColor(229, 231, 235);
    doc.rect(20, 80, 170, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(50, 50, 50);
    doc.text("Désignation", 23, 85);
    doc.text("Qté", 110, 85);
    doc.text("P. Unit", 135, 85);
    doc.text("Total HT", 165, 85);

    let currentY = 94;
    doc.setFont("helvetica", "normal");
    selectedSaleDetail.items.forEach((it: any) => {
      let name = it.productName || '';
      if (name.length > 40) {
        name = name.substring(0, 37) + '...';
      }
      doc.text(name, 23, currentY);
      doc.text((it.quantity || 0).toString(), 111, currentY);
      doc.text(`${formatPDFNum(it.price || 0)} ${currency}`, 135, currentY);
      doc.text(`${formatPDFNum(it.total || 0)} ${currency}`, 165, currentY);
      currentY += 7;
    });

    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.2);
    doc.line(20, currentY, 190, currentY);
    currentY += 7;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    
    doc.text("Sous-total HT:", 115, currentY);
    doc.setFont("helvetica", "bold");
    doc.text(`${formatPDFNum(selectedSaleDetail.subtotal)} ${currency}`, 165, currentY);
    currentY += 6;

    if (selectedSaleDetail.discount > 0) {
      doc.setFont("helvetica", "normal");
      doc.text("Remise:", 115, currentY);
      doc.setFont("helvetica", "bold");
      doc.text(`-${formatPDFNum(selectedSaleDetail.discount)} ${currency}`, 165, currentY);
      currentY += 6;
    }

    if (selectedSaleDetail.taxRate > 0) {
      doc.setFont("helvetica", "normal");
      doc.text(`TVA (${selectedSaleDetail.taxRate}%):`, 115, currentY);
      doc.setFont("helvetica", "bold");
      doc.text(`${formatPDFNum(selectedSaleDetail.tax)} ${currency}`, 165, currentY);
      currentY += 6;
    }

    if (selectedSaleDetail.extraFees > 0) {
      doc.setFont("helvetica", "normal");
      doc.text(`${selectedSaleDetail.customFeeLabel || 'Frais supplémentaires'}:`, 115, currentY);
      doc.setFont("helvetica", "bold");
      doc.text(`${formatPDFNum(selectedSaleDetail.extraFees)} ${currency}`, 165, currentY);
      currentY += 6;
    }

    currentY += 2;
    doc.setDrawColor(30, 58, 138);
    doc.setLineWidth(0.5);
    doc.line(115, currentY - 4, 190, currentY - 4);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30, 58, 138);
    doc.text("TOTAL TTC:", 115, currentY);
    doc.text(`${formatPDFNum(selectedSaleDetail.total)} ${currency}`, 165, currentY);

    currentY += 25;
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.line(40, currentY, 170, currentY);
    currentY += 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(50, 50, 50);
    doc.text((activeTenant as any)?.invoiceFooterMsg || "MERCI DE VOTRE CONFIANCE !", 105, currentY, { align: 'center' });
    currentY += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text((activeTenant as any)?.invoiceSubFooterMsg || "NexaStock ERP Multi-tenant - Document officiel au format PDF", 105, currentY, { align: 'center' });

    const pdfOutput = doc.output('blob');
    const fileName = `facture-${selectedSaleDetail.invoiceNumber}.pdf`;
    const file = new File([pdfOutput], fileName, { type: 'application/pdf' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `Facture ${selectedSaleDetail.invoiceNumber}`,
          text: `Bonjour ! Veuillez trouver ci-joint votre facture officielle au format PDF pour l'achat ${selectedSaleDetail.invoiceNumber}.`
        });
        setShareModalOpen(false);
        return;
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Web Share failed, fallback to direct download:', err);
        }
      }
    }

    const url = URL.createObjectURL(pdfOutput);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (shareChannel === 'whatsapp') {
      const whatsappUrl = `https://wa.me/${shareContactValue.replace(/\s+/g, '')}?text=${encodeURIComponent(
        `Bonjour !\n\nVoici le reçu de votre achat chez ${activeTenant?.name || 'NexaStock'}.\n\n🧾 Facture : ${selectedSaleDetail.invoiceNumber}\n💰 Montant : ${selectedSaleDetail.total.toLocaleString()} ${currency}\n⏱️ Règlement : ${selectedSaleDetail.status === 'Payée' || selectedSaleDetail.paymentMethod !== 'credit' ? 'TOTAL (Payé)' : selectedSaleDetail.status === 'Partiellement payée' ? 'PARTIEL' : 'NON PAYÉ'}\n\nLe document PDF officiel (${fileName}) a été généré et téléchargé sur votre appareil. Veuillez le joindre à cette discussion.`
      )}`;
      window.open(whatsappUrl, '_blank');
    } else {
      const mailtoUrl = `mailto:${shareContactValue}?subject=${encodeURIComponent(`Facture PDF ${selectedSaleDetail.invoiceNumber} - ${activeTenant?.name || 'NexaStock'}`)}&body=${encodeURIComponent(
        `Cher client,\n\nVotre facture officielle ${selectedSaleDetail.invoiceNumber} d'un montant de ${selectedSaleDetail.total.toLocaleString()} ${currency} a été générée avec succès.\n\nLe fichier PDF officiel (${fileName}) a été téléchargé sur votre appareil. Veuillez le joindre à votre e-mail avant de l'envoyer.\n\nCordialement,\nService Comptabilité - ${activeTenant?.name || 'NexaStock'}`
      )}`;
      window.open(mailtoUrl, '_blank');
    }

    alert(`La facture PDF officielle (${fileName}) a été générée et téléchargée sur votre appareil ! Vous pouvez maintenant la partager.`);
    setShareModalOpen(false);
  };

  const handleRecordInstallmentPayment = (sale: any, installmentId: string) => {
    let installments: any[] = [];
    try {
      installments = JSON.parse(sale.creditInstallments || '[]');
    } catch(e) {}

    let payAmt = 0;
    const nextInstallments = installments.map(inst => {
      if (inst.id === installmentId && inst.status !== 'Payée') {
        payAmt = inst.amount;
        return { ...inst, status: 'Payée', paidDate: new Date().toISOString().split('T')[0] };
      }
      return inst;
    });

    const nextPaidAmount = (sale.creditPaidAmount || 0) + payAmt;
    const isFullyPaid = nextPaidAmount >= sale.total;

    const updatedSales = db.sales.map(s => {
      if (s.id === sale.id) {
        return {
          ...s,
          creditPaidAmount: nextPaidAmount,
          creditInstallments: JSON.stringify(nextInstallments),
          status: isFullyPaid ? 'Payée' : 'Partiellement payée'
        };
      }
      return s;
    });

    const updatedCustomers = db.customers.map(c => {
      if (c.id === sale.customerId) {
        return {
          ...c,
          outstandingDebt: Math.max(0, c.outstandingDebt - payAmt)
        };
      }
      return c;
    });

    handleUpdateDb({
      ...db,
      sales: updatedSales,
      customers: updatedCustomers
    });

    setSelectedSaleDetail({
      ...selectedSaleDetail,
      creditPaidAmount: nextPaidAmount,
      creditInstallments: JSON.stringify(nextInstallments),
      status: isFullyPaid ? 'Payée' : 'Partiellement payée'
    });
    alert("Règlement de l'échéance enregistré avec succès !");
  };

  const openReturnModal = (sale: any) => {
    const qtys: Record<string, number> = {};
    sale.items.forEach((it: any) => {
      qtys[it.productId] = 0;
    });
    setReturnQtys(qtys);
    setReturnReason('');
    setRefundAmountInput(0);
    setIsReturnModalOpen(true);
  };

  const handleReturnSubmit = () => {
    if (!handleUpdateDb || !selectedSaleDetail) return;

    let hasReturn = false;
    const updatedProducts = [...db.products];
    const returnedItemsList: any[] = [];

    for (const it of selectedSaleDetail.items) {
      const returnQty = returnQtys[it.productId] || 0;
      if (returnQty > 0) {
        const currentQtyDelivered = it.qtyDelivered !== undefined ? it.qtyDelivered : it.quantity;
        if (returnQty > currentQtyDelivered) {
          alert(`La quantité retournée de ${it.productName} (${returnQty}) ne peut pas dépasser la quantité livrée (${currentQtyDelivered}).`);
          return;
        }
        hasReturn = true;

        const prodIdx = updatedProducts.findIndex(p => p.id === it.productId);
        if (prodIdx !== -1) {
          updatedProducts[prodIdx] = {
            ...updatedProducts[prodIdx],
            quantity: updatedProducts[prodIdx].quantity + returnQty
          };
        }

        returnedItemsList.push({
          productId: it.productId,
          productName: it.productName,
          quantity: returnQty,
          price: it.price
        });
      }
    }

    if (!hasReturn) {
      alert("Veuillez indiquer au moins un produit à retourner.");
      return;
    }

    const returnValueTotal = returnedItemsList.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const newReturnRecord = {
      id: `ret-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      items: returnedItemsList,
      refundAmount: refundAmountInput,
      reason: returnReason.trim() || 'Retour client standard',
      userName: currentCashier.name
    };

    const updatedSaleItems = selectedSaleDetail.items.map((it: any) => {
      const returnQty = returnQtys[it.productId] || 0;
      if (returnQty > 0) {
        const prevQtyDelivered = it.qtyDelivered !== undefined ? it.qtyDelivered : it.quantity;
        const prevQtyReturned = it.qtyReturned !== undefined ? it.qtyReturned : 0;
        
        const nextQtyDelivered = Math.max(0, prevQtyDelivered - returnQty);
        const nextQtyReturned = prevQtyReturned + returnQty;
        const nextQtyRemaining = Math.max(0, it.quantity - nextQtyDelivered - nextQtyReturned);

        return {
          ...it,
          qtyDelivered: nextQtyDelivered,
          qtyReturned: nextQtyReturned,
          qtyRemaining: nextQtyRemaining
        };
      }
      return it;
    });

    const totalDelivered = updatedSaleItems.reduce((sum, item) => sum + (item.qtyDelivered || 0), 0);
    const totalReturned = updatedSaleItems.reduce((sum, item) => sum + (item.qtyReturned || 0), 0);
    const totalRemaining = updatedSaleItems.reduce((sum, item) => sum + (item.qtyRemaining || 0), 0);

    let nextDeliveryStatus: 'Non livrée' | 'Partiellement livrée' | 'Livrée' | 'Retournée' = 'Non livrée';
    if (totalDelivered === 0 && totalReturned > 0) {
      nextDeliveryStatus = 'Retournée';
    } else if (totalDelivered > 0 && totalRemaining > 0) {
      nextDeliveryStatus = 'Partiellement livrée';
    } else if (totalRemaining === 0 && totalDelivered > 0) {
      nextDeliveryStatus = 'Livrée';
    }

    const prevReturns = selectedSaleDetail.returns || [];
    const updatedReturns = [...prevReturns, newReturnRecord];

    const nextCreditPaidAmount = Math.max(0, (selectedSaleDetail.creditPaidAmount || 0) - refundAmountInput);
    let nextPaymentStatus = selectedSaleDetail.paymentStatus || 'Payé';
    if (refundAmountInput >= selectedSaleDetail.total) {
      nextPaymentStatus = 'Remboursé';
    }

    const updatedCustomers = db.customers.map(c => {
      if (c.id === selectedSaleDetail.customerId) {
        const debtDeduction = refundAmountInput > 0 ? 0 : returnValueTotal;
        return {
          ...c,
          outstandingDebt: Math.max(0, c.outstandingDebt - debtDeduction)
        };
      }
      return c;
    });

    const updatedSales = db.sales.map(s => {
      if (s.id === selectedSaleDetail.id) {
        return {
          ...s,
          items: updatedSaleItems,
          returns: updatedReturns,
          deliveryStatus: nextDeliveryStatus,
          paymentStatus: nextPaymentStatus,
          creditPaidAmount: nextCreditPaidAmount,
          isReturned: 1
        };
      }
      return s;
    });

    handleUpdateDb({
      ...db,
      products: updatedProducts,
      customers: updatedCustomers,
      sales: updatedSales
    });

    setIsReturnModalOpen(false);
    setSelectedSaleDetail(null);
    alert(`Retour partiel enregistré ! Stock réintégré (+${returnedItemsList.reduce((s,i) => s + i.quantity, 0)} pièces). Statut livraison mis à jour : ${nextDeliveryStatus}`);
  };

  // --- TAB 3: DYNAMIC REPORTS / ANALYTICS ---
  const reportsData = useMemo(() => {
    const stats = {
      totalSales: 0,
      totalProfit: 0,
      unpaidDebts: 0,
      salesCount: salesHistory.length,
      cashMethodSum: 0,
      mobileMoneySum: 0,
      creditMethodSum: 0,
      otherMethodSum: 0,
    };

    const dailyTrendsMap: Record<string, { date: string; ventes: number; profit: number }> = {};
    const bestSellersMap: Record<string, { name: string; qty: number; totalRev: number }> = {};

    salesHistory.forEach(sale => {
      const isRet = (sale as any).isReturned;
      if (isRet) return;

      const saleTotal = sale.total || 0;
      stats.totalSales += saleTotal;

      if (sale.paymentMethod === 'especes') stats.cashMethodSum += saleTotal;
      else if (sale.paymentMethod === 'mobile_money') stats.mobileMoneySum += saleTotal;
      else if (sale.paymentMethod === 'credit') {
        stats.creditMethodSum += saleTotal;
        const unpaid = saleTotal - ((sale as any).creditPaidAmount || 0);
        stats.unpaidDebts += Math.max(0, unpaid);
      } else {
        stats.otherMethodSum += saleTotal;
      }

      let saleCost = 0;
      sale.items.forEach(it => {
        const prodDef = tenantProducts.find(tp => tp.id === it.productId);
        const buyUnit = prodDef ? prodDef.buyPrice : it.price * 0.6;
        saleCost += buyUnit * it.quantity;

        if (!bestSellersMap[it.productId]) {
          bestSellersMap[it.productId] = { name: it.productName, qty: 0, totalRev: 0 };
        }
        bestSellersMap[it.productId].qty += it.quantity;
        bestSellersMap[it.productId].totalRev += it.total;
      });
      stats.totalProfit += Math.max(0, saleTotal - saleCost);

      const dateKey = sale.date.split('T')[0];
      if (!dailyTrendsMap[dateKey]) {
        dailyTrendsMap[dateKey] = { date: dateKey, ventes: 0, profit: 0 };
      }
      dailyTrendsMap[dateKey].ventes += saleTotal;
      dailyTrendsMap[dateKey].profit += Math.max(0, saleTotal - saleCost);
    });

    const trendsList = Object.values(dailyTrendsMap).sort((a, b) => a.date.localeCompare(b.date)).slice(-10);
    const bestSellersList = Object.values(bestSellersMap).sort((a, b) => b.qty - a.qty).slice(0, 5);

    const paymentShares = [
      { name: 'Espèces', value: stats.cashMethodSum },
      { name: 'Mobile Money', value: stats.mobileMoneySum },
      { name: 'Crédit (Créances)', value: stats.creditMethodSum },
      { name: 'Autres', value: stats.otherMethodSum }
    ].filter(item => item.value > 0);

    return { stats, trendsList, bestSellersList, paymentShares };
  }, [salesHistory, tenantProducts]);

  return {
    // Basic state
    activeTab, setActiveTab,
    activeTenant, currency, planStatus, currentCashier,
    tenantProducts, tenantCustomers, salesHistory,
    
    // Tab 1: Vente
    searchTerm, setSearchTerm,
    selectedCategory, setSelectedCategory,
    barcodeInput, setBarcodeInput,
    cart, setCart,
    selectedCustomerId, setSelectedCustomerId,
    globalDiscount, setGlobalDiscount,
    globalDiscountType, setGlobalDiscountType,
    paymentMethod, setPaymentMethod,
    saleType, setSaleType,
    checkoutInvoiceStatus, setCheckoutInvoiceStatus,
    checkoutDeliveryStatus, setCheckoutDeliveryStatus,
    extraFees, setExtraFees,
    deliveryFee, setDeliveryFee,
    taxStamp, setTaxStamp,
    customFeeLabel, setCustomFeeLabel,
    deliveryStatus, setDeliveryStatus,
    amountPaid, setAmountPaid,
    creditDueDate, setCreditDueDate,
    installmentsCount, setInstallmentsCount,
    categories,
    filteredProducts,
    handleBarcodeSubmit,
    addProductToCart,
    updateCartQty,
    updateLinePrice,
    updateLineDiscount,
    removeCartItem,
    cartSubtotal,
    subtotalDiscount,
    taxRate,
    computedTax,
    orderTotal,
    remainingBalance,
    changeReturned,
    handleQuickCreateCustomer,
    handleCheckout,
    isAddCustomerOpen, setIsAddCustomerOpen,
    newCustName, setNewCustName,
    newCustPhone, setNewCustPhone,
    newCustEmail, setNewCustEmail,
    generatedSale, setGeneratedSale,
    checkoutSuccess, setCheckoutSuccess,

    // Tab 2: Historique
    historySearch, setHistorySearch,
    historyFilterStatus, setHistoryFilterStatus,
    selectedSaleDetail, setSelectedSaleDetail,
    activeSaleDetail,
    isReturnModalOpen, setIsReturnModalOpen,
    returnQtys, setReturnQtys,
    returnReason, setReturnReason,
    refundAmountInput, setRefundAmountInput,
    filteredHistory,
    convertToInvoice,
    handleUpdateSaleState,
    handleUpdateSaleERPStatuses,
    handleRecordNewPayment,
    handleRefaireFacture,
    handleShareActualFile,
    handleRecordInstallmentPayment,
    openReturnModal,
    handleReturnSubmit,
    previewReceiptFormat, setPreviewReceiptFormat,
    shareModalOpen, setShareModalOpen,
    shareChannel, setShareChannel,
    shareContactValue, setShareContactValue,
    sidebarPayAmount, setSidebarPayAmount,
    sidebarPayMethod, setSidebarPayMethod,
    sidebarPayRef, setSidebarPayRef,

    // Tab 3: Rapports
    reportsData,

    // Tab 4: Parametrage
    tenantName, setTenantName,
    tenantCurrency, setTenantCurrency,
    invoicePrefix, setInvoicePrefix,
    invoiceFooterMsg, setInvoiceFooterMsg,
    invoiceSubFooterMsg, setInvoiceSubFooterMsg,
    defaultExtraFeeLabel, setDefaultExtraFeeLabel,
    handleSaveTenantConfig,
  };
}
