import { motion } from 'motion/react';
import type { RefObject } from 'react';
import {
  Search, Barcode, UserPlus, Trash2, Minus, Plus, CheckCircle,
  ShoppingBag, AlertTriangle
} from 'lucide-react';
import type { Product } from '../../types';
import POSCommissionPanel, { type POSCommissionPanelHandle } from './POSCommissionPanel';

interface CartItem {
  product: Product;
  quantity: number;
  negotiatedPrice: number;
  lineDiscount: number;
  commissionPerUnit?: number;
}

interface POSVenteProps {
  searchTerm: string; setSearchTerm: (v: string) => void;
  selectedCategory: string; setSelectedCategory: (v: string) => void;
  barcodeInput: string; setBarcodeInput: (v: string) => void;
  categories: string[];
  filteredProducts: Product[];
  cart: CartItem[];
  selectedCustomerId: string; setSelectedCustomerId: (v: string) => void;
  tenantCustomers: { id: string; name: string; phone: string; }[];
  saleType: string; setSaleType: (v: any) => void;
  currency: string;
  addProductToCart: (p: Product) => void;
  updateCartQty: (id: string, d: number) => void;
  updateLinePrice: (id: string, p: number) => void;
  removeCartItem: (id: string) => void;
  cartSubtotal: number;
  globalDiscount: number; setGlobalDiscount: (v: number) => void;
  globalDiscountType: 'fixed' | 'percent'; setGlobalDiscountType: (v: 'fixed' | 'percent') => void;
  subtotalDiscount: number;
  paymentMethod: string; setPaymentMethod: (v: any) => void;
  taxRate: number;
  computedTax: number;
  orderTotal: number;
  extraFees: number; setExtraFees: (v: number) => void;
  customFeeLabel: string; setCustomFeeLabel: (v: string) => void;
  checkoutInvoiceStatus: string; setCheckoutInvoiceStatus: (v: any) => void;
  checkoutDeliveryStatus: string; setCheckoutDeliveryStatus: (v: any) => void;
  amountPaid: number; setAmountPaid: (v: number) => void;
  remainingBalance: number;
  changeReturned: number;
  creditDueDate: string; setCreditDueDate: (v: string) => void;
  installmentsCount: number; setInstallmentsCount: (v: number) => void;
  handleBarcodeSubmit: (e: any) => void;
  handleCheckout: () => void;
  setIsAddCustomerOpen: (v: boolean) => void;
  setCart: (v: any) => void;
  commissionRef?: RefObject<POSCommissionPanelHandle>;
}

export default function POSVente(props: POSVenteProps) {
  const {
    searchTerm, setSearchTerm,
    selectedCategory, setSelectedCategory,
    barcodeInput, setBarcodeInput,
    categories,
    filteredProducts,
    cart,
    selectedCustomerId, setSelectedCustomerId,
    tenantCustomers,
    saleType, setSaleType,
    currency,
    addProductToCart,
    updateCartQty,
    updateLinePrice,
    removeCartItem,
    cartSubtotal,
    globalDiscount, setGlobalDiscount,
    globalDiscountType, setGlobalDiscountType,
    subtotalDiscount,
    paymentMethod, setPaymentMethod,
    taxRate,
    computedTax,
    orderTotal,
    extraFees, setExtraFees,
    customFeeLabel, setCustomFeeLabel,
    checkoutInvoiceStatus, setCheckoutInvoiceStatus,
    checkoutDeliveryStatus, setCheckoutDeliveryStatus,
    amountPaid, setAmountPaid,
    remainingBalance,
    changeReturned,
    creditDueDate, setCreditDueDate,
    installmentsCount, setInstallmentsCount,
    handleBarcodeSubmit,
    handleCheckout,
    setIsAddCustomerOpen,
    setCart,
    commissionRef,
  } = props;

  return (
    <motion.div
      key="pos-vente"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="grid grid-cols-1 lg:grid-cols-12 gap-6"
    >
      {/* LEFT GRID: PRODUCTS DIRECTORY */}
      <div className="lg:col-span-7 space-y-4">
        
        {/* Live Scanner and Filter headers */}
        <div className="bg-gray-900 border border-gray-850 p-4 rounded-2xl space-y-3.5">
          <div className="flex flex-col md:flex-row gap-3">
            
            {/* Text search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Rechercher par nom, SKU ou référence..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-gray-950 border border-gray-850 pl-9 pr-4 py-2 text-xs rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition"
              />
            </div>

            {/* Simulated Scanner hardware clicker */}
            <form onSubmit={handleBarcodeSubmit} className="relative w-full md:w-56">
              <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
              <input
                type="text"
                placeholder="Simuler scan code-barres..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                className="w-full bg-gray-950 border border-emerald-500/20 pl-9 pr-4 py-2 text-xs rounded-xl text-emerald-400 font-mono placeholder-emerald-800 focus:outline-none focus:border-emerald-500 transition"
              />
            </form>

          </div>

          {/* Categorization list */}
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-gray-800">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${
                  selectedCategory === cat 
                    ? 'bg-blue-600/15 border border-blue-500/20 text-blue-400' 
                    : 'bg-gray-950 border border-gray-850 text-gray-400 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Clicking Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5 max-h-[580px] overflow-y-auto pr-1">
          {filteredProducts.map(p => {
            const qtyLeft = p.quantity;
            const isLow = qtyLeft <= p.alertThreshold;
            const inCartItem = cart.find(c => c.product.id === p.id);
            const isOut = qtyLeft <= 0 || (inCartItem && inCartItem.quantity >= qtyLeft);

            return (
              <button
                key={p.id}
                onClick={() => !isOut && addProductToCart(p)}
                disabled={isOut}
                className={`relative text-left flex flex-col justify-between bg-gray-900 border rounded-2xl p-3.5 h-36 transition-all group ${
                  isOut 
                    ? 'border-gray-850 opacity-40 cursor-not-allowed' 
                    : inCartItem
                      ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/20'
                      : 'border-gray-850 hover:border-gray-700 hover:bg-gray-850/50'
                }`}
              >
                <div>
                  <div className="flex justify-between items-start gap-1">
                    <span className="text-[10px] font-mono text-gray-500 block uppercase truncate">{p.sku}</span>
                    {inCartItem && (
                      <span className="bg-blue-600 text-white text-[9px] font-black rounded-full px-1.5 py-0.5 animate-pulse">
                        x{inCartItem.quantity}
                      </span>
                    )}
                  </div>
                  <h4 className="text-xs font-bold text-gray-200 mt-1 line-clamp-2 leading-relaxed group-hover:text-white transition">
                    {p.name}
                  </h4>
                </div>

                <div className="mt-3">
                  <div className="flex justify-between items-end">
                    <div>
                      <span className="text-[9px] font-medium text-gray-500 block">Prix Public</span>
                      <span className="text-xs font-black font-mono text-white">
                        {p.sellPrice.toLocaleString()} <span className="text-[9.5px] text-gray-400">{currency}</span>
                      </span>
                    </div>

                    <span className={`text-[9.5px] font-mono px-1.5 py-0.5 rounded-md ${
                      qtyLeft <= 0 
                        ? 'bg-red-500/10 text-red-400' 
                        : isLow 
                          ? 'bg-amber-500/10 text-amber-400 animate-pulse' 
                          : 'bg-emerald-500/5 text-emerald-400'
                    }`}>
                      {qtyLeft <= 0 ? 'Rupture' : `${qtyLeft} dispo`}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

      </div>

      {/* RIGHT GRID: CHECKOUT CART & CONFIGURATOR */}
      <div className="lg:col-span-5 space-y-4">
        <div className="bg-gray-900 border border-gray-850 rounded-2xl p-4.5 flex flex-col justify-between min-h-[640px]">
          
          {/* Header configuration */}
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-gray-850">
              <h3 className="text-xs font-bold text-gray-300 uppercase font-mono tracking-wider flex items-center gap-1.5">
                🛒 Panier en cours ({cart.length} lignes)
              </h3>
              <button
                onClick={() => setCart([])}
                className="text-[10px] text-gray-500 hover:text-red-400 flex items-center gap-1 transition"
              >
                <Trash2 className="w-3.5 h-3.5" /> Vider
              </button>
            </div>

            {/* Customer and Sale Mode settings */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-mono font-bold text-gray-500 uppercase block mb-1">Associer Client</label>
                <div className="flex gap-1">
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="flex-1 bg-gray-950 border border-gray-850 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">-- Vente Comptoir --</option>
                    {tenantCustomers.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.phone || 'Pas de num'})</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setIsAddCustomerOpen(true)}
                    className="bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/15 p-2 rounded-xl text-blue-400 transition"
                    title="Créer rapidement un client"
                  >
                    <UserPlus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono font-bold text-gray-500 uppercase block mb-1">Mode de vente</label>
                <select
                  value={saleType}
                  onChange={(e) => setSaleType(e.target.value as any)}
                  className="w-full bg-gray-950 border border-gray-850 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="standard">⚡ Vente Rapide (sans doc)</option>
                  <option value="ticket">🎫 Vente avec Ticket Caisse</option>
                  <option value="facture">📄 Vente avec Facture A4</option>
                </select>
              </div>
            </div>

            {/* Cart Item rows */}
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {cart.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <ShoppingBag className="w-10 h-10 text-gray-850 mx-auto" />
                  <p className="text-[11px] text-gray-500 italic">Aucun article ajouté au panier.</p>
                </div>
              ) : (
                cart.map(item => {
                  const minPriceAllowed = (item.product as any).minPrice || item.product.sellPrice * 0.8;
                  const isNegotiatedTooLow = item.negotiatedPrice < minPriceAllowed;

                  return (
                    <div 
                      key={item.product.id}
                      className="bg-gray-950 border border-gray-850 p-3 rounded-xl flex flex-col gap-2 relative group"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <h5 className="text-xs font-bold text-gray-200 truncate">{item.product.name}</h5>
                          <span className="text-[9.5px] font-mono text-gray-500">Ref: {item.product.sku}</span>
                        </div>
                        <button
                          onClick={() => removeCartItem(item.product.id)}
                          className="text-gray-600 hover:text-red-400 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-12 gap-2 items-center">
                        {/* Quantity triggers */}
                        <div className="col-span-4 flex items-center bg-gray-900 border border-gray-850 rounded-lg p-0.5">
                          <button
                            onClick={() => updateCartQty(item.product.id, -1)}
                            className="p-1 hover:text-white transition"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="flex-1 text-center text-xs font-black font-mono text-white">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateCartQty(item.product.id, 1)}
                            className="p-1 hover:text-white transition"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {/* African Negotiable Unit Price */}
                        <div className="col-span-5 relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-mono text-gray-500 uppercase">Prix:</span>
                          <input
                            type="number"
                            value={item.negotiatedPrice}
                            onChange={(e) => updateLinePrice(item.product.id, Number(e.target.value))}
                            className={`w-full bg-gray-900 border pl-10 pr-2 py-1 text-xs rounded-lg font-mono font-bold text-white text-right focus:outline-none ${
                              isNegotiatedTooLow 
                                ? 'border-red-500/40 text-red-400 focus:border-red-500' 
                                : item.negotiatedPrice !== item.product.sellPrice
                                  ? 'border-amber-500/40 text-amber-400 focus:border-amber-500'
                                  : 'border-gray-800 focus:border-blue-500'
                            }`}
                          />
                        </div>

                        {/* Subtotal Display */}
                        <div className="col-span-3 text-right">
                          <span className="text-[10px] text-gray-500 block">Total</span>
                          <span className="text-xs font-bold font-mono text-white">
                            {((item.negotiatedPrice - item.lineDiscount) * item.quantity).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Negotiation warnings */}
                      {item.negotiatedPrice !== item.product.sellPrice && (
                        <div className="flex justify-between items-center pt-1 border-t border-gray-900 text-[9px] font-mono">
                          <span className="text-gray-500">Public: {item.product.sellPrice}</span>
                          {isNegotiatedTooLow ? (
                            <span className="text-red-400 font-bold animate-pulse">⚠️ Sous le min conseillé ({minPriceAllowed})</span>
                          ) : (
                            <span className="text-amber-400 font-bold">✓ Prix négocié</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Commission panel */}
          <div className="mt-4">
            <POSCommissionPanel
              ref={commissionRef}
              cart={cart as any}
              onCartUpdate={setCart}
              currency={currency}
            />
          </div>

          {/* Computational footer calculations */}
          <div className="space-y-4 pt-4 border-t border-gray-850 mt-4">
            
            {/* African Specific Charges & Discounts inputs */}
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono bg-gray-950 p-2.5 rounded-xl border border-gray-850">
              <div className="col-span-1">
                <label className="text-gray-500 block mb-0.5">LIBELLÉ FRAIS EXTRA</label>
                <input
                  type="text"
                  placeholder="ex: Transport, Main d'oeuvre..."
                  value={customFeeLabel}
                  onChange={(e) => setCustomFeeLabel(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-850 rounded px-1.5 py-1 text-white font-mono text-[10px]"
                />
              </div>
              <div>
                <label className="text-gray-500 block mb-0.5">MONTANT DU FRAIS</label>
                <input
                  type="number"
                  placeholder="0"
                  value={extraFees || ''}
                  onChange={(e) => setExtraFees(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-gray-900 border border-gray-850 rounded px-1.5 py-1 text-white text-right font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[10px] font-mono font-bold text-gray-500 uppercase block mb-1">Remise Globale</label>
                <div className="flex rounded-lg overflow-hidden border border-gray-850">
                  <input
                    type="number"
                    placeholder="Valeur..."
                    value={globalDiscount || ''}
                    onChange={(e) => setGlobalDiscount(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-gray-950 px-1.5 py-1 text-white text-xs font-mono"
                  />
                  <button
                    onClick={() => setGlobalDiscountType(globalDiscountType === 'fixed' ? 'percent' : 'fixed')}
                    className="bg-gray-850 hover:bg-gray-800 px-1.5 text-gray-300 font-mono text-[10px]"
                  >
                    {globalDiscountType === 'fixed' ? currency : '%'}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono font-bold text-gray-500 uppercase block mb-1">Règlement</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full bg-gray-950 border border-gray-850 rounded-xl px-1.5 py-1.5 text-[10px] text-white font-semibold focus:outline-none focus:border-blue-500"
                >
                  <option value="especes">💵 Espèces</option>
                  <option value="mobile_money">📱 Mobile</option>
                  <option value="carte">💳 Carte</option>
                  <option value="credit">⏳ Crédit</option>
                </select>
              </div>
            </div>

            {/* Advanced status parameters */}
            <div className="grid grid-cols-2 gap-2 text-xs bg-gray-950 p-2.5 rounded-xl border border-gray-850">
              <div>
                <label className="text-[10px] font-mono font-bold text-gray-500 uppercase block mb-1">Type de Document</label>
                <select
                  value={checkoutInvoiceStatus}
                  onChange={(e) => setCheckoutInvoiceStatus(e.target.value as any)}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg p-1.5 font-mono text-[10px] text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="Validée">📄 Facture Validée</option>
                  <option value="Brouillon">📝 Facture Brouillon</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-mono font-bold text-gray-500 uppercase block mb-1">Livraison Initiale</label>
                <select
                  value={checkoutDeliveryStatus}
                  onChange={(e) => setCheckoutDeliveryStatus(e.target.value as any)}
                  disabled={checkoutInvoiceStatus === 'Brouillon'}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg p-1.5 font-mono text-[10px] text-white focus:outline-none focus:border-blue-500 disabled:opacity-40"
                >
                  <option value="livre_total">🚚 Livré immédiatement</option>
                  <option value="non_livre">📦 À livrer plus tard</option>
                </select>
              </div>
            </div>

            {/* If Credit mode chosen, show due dates config */}
            {paymentMethod === 'credit' && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="bg-amber-500/5 border border-amber-500/10 p-3 rounded-xl space-y-2 text-[11px] font-mono"
              >
                <p className="font-bold text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> PARAMÈTRES DU CRÉDIT CLIENT
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-gray-500 text-[10px] block mb-0.5">DATE PREMIÈRE ÉCHÉANCE</label>
                    <input
                      type="date"
                      value={creditDueDate}
                      onChange={(e) => setCreditDueDate(e.target.value)}
                      className="bg-gray-950 border border-gray-800 rounded px-2 py-1 text-[11px] text-white w-full"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 text-[10px] block mb-0.5">NOMBRE DE MENSUALITÉS</label>
                    <select
                      value={installmentsCount}
                      onChange={(e) => setInstallmentsCount(Number(e.target.value))}
                      className="bg-gray-950 border border-gray-800 rounded px-2 py-1 text-[11px] text-white w-full"
                    >
                      <option value={1}>Une seule fois (30 j)</option>
                      <option value={2}>2 fois (Mensuel)</option>
                      <option value={3}>3 fois (Trimestriel)</option>
                      <option value={4}>4 fois</option>
                    </select>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Cash input simulator */}
            <div className="bg-gray-950 border border-gray-850 p-3 rounded-xl space-y-1">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-gray-500">MONTANT REÇU (CLIENT)</span>
                {paymentMethod === 'credit' && (
                  <span className="text-amber-400 font-bold">ACOMPTE / DEPÔT</span>
                )}
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg p-2 font-mono text-sm font-black text-white text-right focus:outline-none"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-mono">{currency}</span>
              </div>

              <div className="flex justify-between pt-1 text-[11px] font-mono">
                {paymentMethod === 'credit' ? (
                  <>
                    <span className="text-gray-500">Reste à payer (Crédit) :</span>
                    <span className="text-amber-400 font-bold">{remainingBalance.toLocaleString()} {currency}</span>
                  </>
                ) : (
                  <>
                    <span className="text-gray-500">Monnaie à rendre :</span>
                    <span className="text-emerald-400 font-bold">{changeReturned.toLocaleString()} {currency}</span>
                  </>
                )}
              </div>
            </div>

            {/* Sub totals list */}
            <div className="space-y-1.5 text-xs font-mono border-t border-gray-850 pt-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Sous-total :</span>
                <span className="text-gray-300">{cartSubtotal.toLocaleString()} {currency}</span>
              </div>
              {subtotalDiscount > 0 && (
                <div className="flex justify-between text-red-400">
                  <span>Remise :</span>
                  <span>-{subtotalDiscount.toLocaleString()} {currency}</span>
                </div>
              )}
              {taxRate > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">TVA ({taxRate}%) :</span>
                  <span className="text-gray-300">{computedTax.toLocaleString()} {currency}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-gray-800 text-sm font-bold">
                <span className="text-white">NET À PAYER :</span>
                <span className="text-blue-400 font-mono font-black">{orderTotal.toLocaleString()} {currency}</span>
              </div>
            </div>

            {/* Checkout Button */}
            <button
              onClick={handleCheckout}
              disabled={cart.length === 0}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition text-white text-xs font-black py-3 rounded-xl shadow-lg shadow-blue-500/10 flex items-center justify-center gap-1.5 uppercase font-mono tracking-wider"
            >
              <CheckCircle className="w-4 h-4" /> Enregistrer la transaction
            </button>

          </div>

        </div>
      </div>

    </motion.div>
  );
}
