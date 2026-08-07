/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence } from 'motion/react';
import { 
  ShoppingBag, 
  Smartphone, 
  History,
  BarChart3,
  Settings,
  Handshake
} from 'lucide-react';
import { usePOSState } from './pos/usePOSState';
import POSVente from './pos/POSVente';
import POSHistorique from './pos/POSHistorique';
import POSRapports from './pos/POSRapports';
import POSParametrage from './pos/POSParametrage';
import POSQuickCustomerModal from './pos/POSQuickCustomerModal';
import POSCheckoutSuccessModal from './pos/POSCheckoutSuccessModal';
import POSReturnModal from './pos/POSReturnModal';
import POSShareModal from './pos/POSShareModal';
import POSCommissionPanel, { type POSCommissionPanelHandle, type CommissionPayload } from './pos/POSCommissionPanel';

function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('nexastock_token');
  return fetch(url, {
    ...options,
    headers: { ...options.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}

export default function POS() {
  const commissionRef = useRef<POSCommissionPanelHandle>(null);
  const commissionSnapshotRef = useRef<CommissionPayload | null>(null);
  const [commissionNotification, setCommissionNotification] = useState('');

  const recordCommissionAfterCheckout = useCallback(async (sale: any) => {
    const payload = commissionSnapshotRef.current;
    commissionSnapshotRef.current = null;
    if (!payload || payload.commissionItems.length === 0) return;

    try {
      const res = await authFetch('/api/commissions/v2/sale/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleId: sale.id,
          affiliateId: payload.affiliateId,
          invoiceNumber: sale.invoiceNumber,
          customerName: sale.customerName,
          saleDate: sale.date,
          saleTotal: sale.total,
          items: payload.commissionItems,
          paymentSchedule: payload.paymentSchedule,
          immediatePayment: payload.immediatePayment,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const affName = commissionRef.current?.getAffiliateName() || '';
        setCommissionNotification(
          `✅ Commission ${data.totalCommission.toLocaleString()} GNF enregistrée pour ${affName}`
        );
      } else {
        const err = await res.json().catch(() => ({ error: 'Erreur serveur' }));
        setCommissionNotification(`❌ Commission non enregistrée : ${err.error || 'erreur inconnue'}`);
      }
    } catch (err) {
      console.error('Commission recording failed:', err);
      setCommissionNotification('❌ Commission non enregistrée (hors ligne ?). Vérifiez la connexion.');
    }
  }, []);

  const {
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
  } = usePOSState();

  const handleCheckoutWithCommission = useCallback(() => {
    commissionSnapshotRef.current = commissionRef.current?.getPayload() ?? null;
    handleCheckout();
  }, [handleCheckout]);

  useEffect(() => {
    if (checkoutSuccess && generatedSale) {
      recordCommissionAfterCheckout(generatedSale);
    }
  }, [checkoutSuccess, generatedSale]);

  return (
    <div className="space-y-6" id="pos-root-view">
      
      {/* Upper sub navigation header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-gray-900 border border-gray-850 p-4 rounded-2xl gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-blue-500" /> Facturation & Terminal de Caisse (POS)
          </h2>
          <p className="text-xs text-gray-400">Système de vente multi-mode africain offline-first synchronisé</p>
        </div>

        <div className="flex gap-1 bg-gray-950 p-1 rounded-xl border border-gray-850 w-full md:w-auto">
          <button
            onClick={() => setActiveTab('vente')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'vente' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" /> Nouvelle Vente
          </button>
          <button
            onClick={() => setActiveTab('historique')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'historique' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5" /> Historique & Crédits
          </button>
          <button
            onClick={() => setActiveTab('rapports')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'rapports' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" /> rapports & Marges
          </button>
          <button
            onClick={() => setActiveTab('parametrage')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'parametrage' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Settings className="w-3.5 h-3.5" /> Paramétrage Facture
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        
        {/* TAB 1: COOP CAISSIER POS VIEW */}
        {activeTab === 'vente' && (
          <POSVente
            searchTerm={searchTerm} setSearchTerm={setSearchTerm}
            selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory}
            barcodeInput={barcodeInput} setBarcodeInput={setBarcodeInput}
            categories={categories}
            filteredProducts={filteredProducts}
            cart={cart}
            selectedCustomerId={selectedCustomerId} setSelectedCustomerId={setSelectedCustomerId}
            tenantCustomers={tenantCustomers}
            saleType={saleType} setSaleType={setSaleType as any}
            currency={currency}
            addProductToCart={addProductToCart}
            updateCartQty={updateCartQty}
            updateLinePrice={updateLinePrice}
            removeCartItem={removeCartItem}
            cartSubtotal={cartSubtotal}
            globalDiscount={globalDiscount} setGlobalDiscount={setGlobalDiscount}
            globalDiscountType={globalDiscountType} setGlobalDiscountType={setGlobalDiscountType}
            subtotalDiscount={subtotalDiscount}
            paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod as any}
            taxRate={taxRate}
            computedTax={computedTax}
            orderTotal={orderTotal}
            extraFees={extraFees} setExtraFees={setExtraFees}
            customFeeLabel={customFeeLabel} setCustomFeeLabel={setCustomFeeLabel}
            checkoutInvoiceStatus={checkoutInvoiceStatus} setCheckoutInvoiceStatus={setCheckoutInvoiceStatus as any}
            checkoutDeliveryStatus={checkoutDeliveryStatus} setCheckoutDeliveryStatus={setCheckoutDeliveryStatus as any}
            amountPaid={amountPaid} setAmountPaid={setAmountPaid}
            remainingBalance={remainingBalance}
            changeReturned={changeReturned}
            creditDueDate={creditDueDate} setCreditDueDate={setCreditDueDate}
            installmentsCount={installmentsCount} setInstallmentsCount={setInstallmentsCount}
            handleBarcodeSubmit={handleBarcodeSubmit}
            handleCheckout={handleCheckoutWithCommission}
            setIsAddCustomerOpen={setIsAddCustomerOpen}
            setCart={setCart}
            commissionRef={commissionRef}
          />
        )}

        {/* TAB 2: HISTORICAL TRANSACTIONS & CLIENT CREDITS VIEW */}
        {activeTab === 'historique' && (
          <POSHistorique
            historySearch={historySearch} setHistorySearch={setHistorySearch}
            historyFilterStatus={historyFilterStatus} setHistoryFilterStatus={setHistoryFilterStatus}
            filteredHistory={filteredHistory}
            activeSaleDetail={activeSaleDetail}
            selectedSaleDetail={selectedSaleDetail} setSelectedSaleDetail={setSelectedSaleDetail}
            currency={currency}
            activeTenant={activeTenant}
            convertToInvoice={convertToInvoice}
            handleUpdateSaleERPStatuses={handleUpdateSaleERPStatuses}
            handleRecordNewPayment={handleRecordNewPayment}
            handleRefaireFacture={handleRefaireFacture}
            handleShareActualFile={handleShareActualFile}
            handleRecordInstallmentPayment={handleRecordInstallmentPayment}
            openReturnModal={openReturnModal}
            previewReceiptFormat={previewReceiptFormat} setPreviewReceiptFormat={setPreviewReceiptFormat as any}
            shareModalOpen={shareModalOpen} setShareModalOpen={setShareModalOpen}
            setShareContactValue={setShareContactValue}
            sidebarPayAmount={sidebarPayAmount} setSidebarPayAmount={setSidebarPayAmount}
            sidebarPayMethod={sidebarPayMethod} setSidebarPayMethod={setSidebarPayMethod}
            sidebarPayRef={sidebarPayRef} setSidebarPayRef={setSidebarPayRef}
            tenantCustomers={tenantCustomers}
            selectedCustomerId={selectedCustomerId}
          />
        )}

        {/* TAB 3: DYNAMIC REPORTS & MARGINS ANALYTICS VIEW */}
        {activeTab === 'rapports' && (
          <POSRapports
            currency={currency}
            reportsData={reportsData}
          />
        )}

        {/* TAB 4: FACTURE DYNAMIC CONFIGURATION & SAAS ALIGNMENT */}
        {activeTab === 'parametrage' && (
          <POSParametrage
            tenantName={tenantName} setTenantName={setTenantName}
            tenantCurrency={tenantCurrency} setTenantCurrency={setTenantCurrency}
            invoicePrefix={invoicePrefix} setInvoicePrefix={setInvoicePrefix}
            invoiceFooterMsg={invoiceFooterMsg} setInvoiceFooterMsg={setInvoiceFooterMsg}
            invoiceSubFooterMsg={invoiceSubFooterMsg} setInvoiceSubFooterMsg={setInvoiceSubFooterMsg}
            defaultExtraFeeLabel={defaultExtraFeeLabel} setDefaultExtraFeeLabel={setDefaultExtraFeeLabel}
            handleSaveTenantConfig={handleSaveTenantConfig}
          />
        )}

      </AnimatePresence>

      {/* MODAL 1: ADD QUICK CUSTOMER OVERLAY */}
      <POSQuickCustomerModal
        isAddCustomerOpen={isAddCustomerOpen}
        setIsAddCustomerOpen={setIsAddCustomerOpen}
        newCustName={newCustName} setNewCustName={setNewCustName}
        newCustPhone={newCustPhone} setNewCustPhone={setNewCustPhone}
        newCustEmail={newCustEmail} setNewCustEmail={setNewCustEmail}
        handleQuickCreateCustomer={handleQuickCreateCustomer}
      />

      {/* MODAL 2: CHECKOUT SUCCESS POPUP WITH RECEIPT PREVIEW */}
      <POSCheckoutSuccessModal
        checkoutSuccess={checkoutSuccess}
        generatedSale={generatedSale}
        activeTenant={activeTenant}
        currency={currency}
        commissionNotification={commissionNotification}
        onPrintReceipt={() => {
          setSelectedSaleDetail(generatedSale);
          setCheckoutSuccess(false);
          setActiveTab('historique');
        }}
        onNewSale={() => { setCheckoutSuccess(false); setCommissionNotification(''); }}
      />

      {/* MODAL 3: RETURN PRODUCTS FORM */}
      <POSReturnModal
        isReturnModalOpen={isReturnModalOpen}
        selectedSaleDetail={selectedSaleDetail}
        returnQtys={returnQtys} setReturnQtys={setReturnQtys}
        returnReason={returnReason} setReturnReason={setReturnReason}
        refundAmountInput={refundAmountInput} setRefundAmountInput={setRefundAmountInput}
        handleReturnSubmit={handleReturnSubmit}
        setIsReturnModalOpen={setIsReturnModalOpen}
        currency={currency}
      />

      {/* MODAL 4: DIGITAL SHARE OVERLAY (WHATSAPP / EMAIL) */}
      <POSShareModal
        shareModalOpen={shareModalOpen}
        selectedSaleDetail={selectedSaleDetail}
        shareChannel={shareChannel} setShareChannel={setShareChannel}
        shareContactValue={shareContactValue} setShareContactValue={setShareContactValue}
        handleShareActualFile={handleShareActualFile}
        setShareModalOpen={setShareModalOpen}
        activeTenant={activeTenant}
        currency={currency}
      />

    </div>
  );
}
