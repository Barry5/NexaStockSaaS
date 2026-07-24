export type SubscriptionPlan = 'Free' | 'Standard' | 'Premium' | 'Enterprise';
export type UserRole = 'superadmin' | 'owner' | 'admin' | 'gerant' | 'vendeur' | 'comptable' | 'stock_manager' | 'lecture_seule';
export type PaymentMethod = 'especes' | 'carte' | 'mobile_money' | 'credit';
export type LoanType = 'entrant' | 'sortant';

export type TabType = 'dashboard' | 'products' | 'pos' | 'crm' | 'expenses' | 'ai' | 'settings' | 'saasadmin' | 'users' | 'invoicing' | 'rbac' | 'delivery-notes';

export type InvoiceStatus = 'draft' | 'validated' | 'cancelled' | 'archived';
export type DeliveryStatus = 'not_delivered' | 'partially_delivered' | 'fully_delivered' | 'cancelled';
export type PaymentStatusType = 'unpaid' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
export type DeliveryOrderStatus = 'draft' | 'validated' | 'in_transit' | 'delivered' | 'cancelled';
export type ReturnStatus = 'draft' | 'validated' | 'cancelled';
export type InvoiceType = 'sale' | 'purchase' | 'credit_note' | 'debit_note';
export type SaasSubTabType = 'stats' | 'tenants' | 'users' | 'invoices' | 'logs' | 'support' | 'plans' | 'modules';
export type ExpenseStatus = 'paye' | 'en_attente';
export type LoanStatus = 'actif' | 'rembourse';
export type InstallmentStatus = 'en_attente' | 'paye';
export type PaymentApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'INFO_REQUESTED';
export type SubscriptionStatus = 'ACTIVE' | 'TRIAL' | 'PENDING' | 'EXPIRED' | 'SUSPENDED' | 'CANCELED' | 'BLOCKED' | 'RENEWAL_PENDING';

export interface Tenant {
  id: string;
  name: string;
  description: string;
  plan: SubscriptionPlan | string;
  logo: string;
  address: string;
  phone: string;
  currency: string;
  taxRate?: number;
  customCategories?: string[];
  createdAt: string;
  subscriptionPlanId?: string;
  subscriptionStatus?: SubscriptionStatus;
  subscriptionStartDate?: string;
  subscriptionEndDate?: string;
  subscriptionRenewalDate?: string;
  trialStartDate?: string;
  trialEndDate?: string;
  gracePeriodEndDate?: string;
  lastReminderSentDate?: string;
  trialDaysConfigured?: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  tenantId?: string | null;
  active: boolean;
  avatar?: string;
  password?: string;
  firstLoginReset?: boolean;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  description: string;
  category: string;
  buyPrice: number;
  sellPrice: number;
  quantity: number;
  alertThreshold: number;
  image?: string;
  tenantId: string;
  createdAt: string;
}

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  total: number;
  qtyDelivered?: number;
  qtyRemaining?: number;
  qtyReturned?: number;
}

export interface PaymentHistoryItem {
  id: string;
  date: string;
  time: string;
  amount: number;
  paymentMethod: string;
  reference: string;
  userName: string;
}

export interface SaleReturnItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  reason: string;
  date: string;
  userName: string;
}

export interface Sale {
  id: string;
  invoiceNumber: string;
  date: string;
  items: SaleItem[];
  subtotal: number;
  tax: number;
  taxRate?: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  customerId?: string;
  customerName?: string;
  tenantId: string;
  employeeId: string;
  employeeName: string;
  status?: string;
  creditDueDate?: string;
  creditPaidAmount?: number;
  creditInstallments?: number | string;
  extraFees?: number;
  deliveryFee?: number;
  taxStamp?: number;
  changeReturned?: number;
  saleType?: string;
  isReturned?: number;
  customFeeLabel?: string;
  abandonReason?: string;
  invoiceStatus?: 'Brouillon' | 'Validée' | 'Annulée' | 'Archivée';
  paymentStatus?: 'Non payé' | 'Partiellement payé' | 'Payé' | 'Remboursé';
  deliveryStatus?: 'Non livrée' | 'Partiellement livrée' | 'Livrée' | 'Retournée';
  creditStatus?: 'Pas de crédit' | 'Crédit actif' | 'Crédit en retard' | 'Crédit soldé';
  payments?: PaymentHistoryItem[];
  returns?: SaleReturnItem[];
  creditComments?: string[];
  creditRelances?: number;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  productId?: string;
  productName: string;
  productSku?: string;
  quantity: number;
  price: number;
  total: number;
  qtyDelivered: number;
  qtyReturned: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  type: InvoiceType;
  date: string;
  dueDate?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  subtotal: number;
  taxRate: number;
  tax: number;
  discount: number;
  discountType: 'percentage' | 'fixed';
  shipping: number;
  total: number;
  paidAmount: number;
  status: InvoiceStatus;
  deliveryStatus: DeliveryStatus;
  paymentStatus: PaymentStatusType;
  notes?: string;
  termsConditions?: string;
  tenantId: string;
  employeeId?: string;
  employeeName?: string;
  createdAt: string;
  updatedAt: string;
  items?: InvoiceItem[];
  deliveryOrders?: DeliveryOrder[];
  payments?: Payment[];
  returns?: ReturnRecord[];
}

export interface DeliveryOrder {
  id: string;
  deliveryNumber: string;
  invoiceId: string;
  date: string;
  status: DeliveryOrderStatus;
  notes?: string;
  createdBy?: string;
  createdByName?: string;
  tenantId: string;
  createdAt: string;
  validatedAt?: string;
  cancelledAt?: string;
  driverName?: string;
  vehicleInfo?: string;
  warehouseOrigin?: string;
  deliveryAddress?: string;
  deliveryPhone?: string;
  deliveryDate?: string;
  deliveryTime?: string;
  customerSignature?: string;
  driverSignature?: string;
  companyStamp?: string;
  invoiceNumber?: string;
  customerName?: string;
  customerPhone?: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedByName?: string;
  items?: DeliveryOrderItem[];
}

export interface DeliveryOrderItem {
  id: string;
  deliveryOrderId: string;
  invoiceItemId: string;
  productId?: string;
  productName: string;
  productSku?: string;
  quantity: number;
  price: number;
  total: number;
  qtyAlreadyDelivered?: number;
}

export interface DeliveryNoteAudit {
  id: string;
  deliveryNoteId: string;
  action: string;
  description?: string;
  userId?: string;
  userName?: string;
  tenantId: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  date: string;
  amount: number;
  method: string;
  reference?: string;
  notes?: string;
  tenantId: string;
  createdBy?: string;
  createdByName?: string;
  createdAt: string;
}

export interface ReturnRecord {
  id: string;
  returnNumber: string;
  invoiceId: string;
  date: string;
  status: ReturnStatus;
  reason?: string;
  tenantId: string;
  createdBy?: string;
  createdByName?: string;
  createdAt: string;
  validatedAt?: string;
  items?: ReturnItem[];
}

export interface ReturnItem {
  id: string;
  returnId: string;
  invoiceItemId: string;
  productId?: string;
  productName: string;
  quantity: number;
  price: number;
  total: number;
  reason?: string;
}

export interface InvoiceAuditLog {
  id: string;
  invoiceId: string;
  action: string;
  details?: string;
  userId?: string;
  userName?: string;
  timestamp: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  loyaltyPoints: number;
  outstandingDebt: number;
  tenantId: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  tenantId: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  category: string;
  date: string;
  description: string;
  recipient: string;
  paymentMethod: string;
  status: ExpenseStatus;
  attachment?: string;
  tenantId: string;
}

export interface Repayment {
  id: string;
  amount: number;
  date: string;
  note: string;
}

export interface LoanInstallment {
  id: string;
  dueDate: string;
  amount: number;
  status: InstallmentStatus;
  paidDate?: string;
  note?: string;
}

export interface Loan {
  id: string;
  type: LoanType;
  partnerName: string;
  amount: number;
  date: string;
  description: string;
  repayments: Repayment[];
  remainingBalance: number;
  status: LoanStatus;
  tenantId: string;
  installments?: LoanInstallment[];
}

export interface Warehouse {
  id: string;
  name: string;
  location: string;
  tenantId: string;
}

export interface StockTransfer {
  id: string;
  productId: string;
  productName: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  date: string;
  status: 'termine' | 'en_cours';
  tenantId: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
  ipAddress?: string;
  tenantId: string;
}

export interface SubscriptionInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  amount: number;
  plan: SubscriptionPlan;
  status: 'paye' | 'impaye' | 'suspendu';
  tenantId: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  priceDelta: number;
}

export interface PricingPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  durationDays: number;
  features: string[];
  limits: {
    maxProducts: number;
    maxSales: number;
    maxCustomers: number;
    maxUsers: number;
    maxWarehouses?: number;
    storageLimitMb?: number;
    backupSupported?: boolean;
    exportSupported?: boolean;
    apiSupported?: boolean;
  };
  color: string;
  displayOrder: number;
  active: boolean;
}

export interface SubscriptionPayment {
  id: string;
  tenantId: string;
  tenantName: string;
  planId: string;
  planName: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  reference: string;
  transactionNumber: string;
  date: string;
  comment: string;
  receiptImage?: string;
  status: PaymentApprovalStatus;
  adminComment?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalSaaSSettings {
  trialDays: number;
  gracePeriodDays: number;
  revertToPlanOnExpiry: 'Free' | 'ReadOnly';
  orangeMoneyNumber?: string;
  orangeMoneyName?: string;
  mobileMoneyNumber?: string;
  mobileMoneyName?: string;
  bankDetails?: string;
  paymentInstructions?: string;
  automaticActivation?: boolean;
}

export interface DBState {
  tenants: Tenant[];
  users: User[];
  products: Product[];
  sales: Sale[];
  customers: Customer[];
  suppliers: Supplier[];
  expenses: Expense[];
  loans: Loan[];
  warehouses?: Warehouse[];
  transfers?: StockTransfer[];
  auditLogs?: AuditLog[];
  subscriptionInvoices?: SubscriptionInvoice[];
  variants?: ProductVariant[];
  saasCurrency?: string;
  pricingPlans?: PricingPlan[];
  subscriptionPayments?: SubscriptionPayment[];
  globalSaaSSettings?: GlobalSaaSSettings;
  invoices?: Invoice[];
  deliveryOrders?: DeliveryOrder[];
  payments?: Payment[];
  returns?: ReturnRecord[];
  invoiceAuditLogs?: InvoiceAuditLog[];
  deliveryNoteAudit?: DeliveryNoteAudit[];
  affiliates?: Affiliate[];
  commissionRules?: CommissionRule[];
  commissionLedger?: CommissionLedgerEntry[];
  commissionPayments?: CommissionPayment[];
  commissionAudit?: CommissionAudit[];
  moduleDefinitions?: ModuleDefinition[];
  planModules?: PlanModule[];
  tenantModules?: TenantModule[];
}

export interface Affiliate {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  photo?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  country?: string;
  company?: string;
  idNumber?: string;
  status: 'active' | 'suspended' | 'blocked';
  commissionRules?: string;
  notes?: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionRule {
  id: string;
  name: string;
  type: 'fixed_product' | 'fixed_category' | 'percentage' | 'margin' | 'per_affiliate' | 'per_client' | 'per_quantity' | 'per_revenue' | 'campaign';
  value: number;
  minValue?: number;
  maxValue?: number;
  productId?: string;
  category?: string;
  clientId?: string;
  affiliateId?: string;
  campaign?: string;
  priority: number;
  active: boolean;
  tenantId: string;
  createdAt: string;
}

export interface CommissionLedgerEntry {
  id: string;
  affiliateId: string;
  type: 'commission' | 'bonus' | 'bonus_exceptional' | 'adjustment_positive' | 'payment' | 'correction' | 'cancellation' | 'return' | 'regularization';
  reference?: string;
  referenceType?: string;
  description?: string;
  credit: number;
  debit: number;
  balance: number;
  status: 'pending' | 'available' | 'to_pay' | 'partially_paid' | 'paid' | 'suspended' | 'blocked' | 'cancelled' | 'recalculated';
  invoiceId?: string;
  invoiceNumber?: string;
  customerName?: string;
  productName?: string;
  quantity?: number;
  sellPrice?: number;
  minPrice?: number;
  commissionAmount?: number;
  paymentId?: string;
  userId?: string;
  userName?: string;
  tenantId: string;
  createdAt: string;
}

export interface CommissionPayment {
  id: string;
  reference: string;
  affiliateId: string;
  affiliateName: string;
  amount: number;
  method: string;
  currency: string;
  notes?: string;
  ledgerIds: string[];
  userId?: string;
  userName?: string;
  tenantId: string;
  createdAt: string;
}

export interface CommissionAudit {
  id: string;
  affiliateId: string;
  action: string;
  details?: string;
  oldValue?: string;
  newValue?: string;
  userId?: string;
  userName?: string;
  tenantId: string;
  createdAt: string;
}

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface NotificationItem {
  id: string;
  text: string;
  time: string;
  type?: NotificationType;
}

// RBAC Types
export type PermissionKey =
  | 'dashboard.view'
  | 'products.view' | 'products.create' | 'products.edit' | 'products.delete'
  | 'sales.view' | 'sales.create' | 'sales.edit' | 'sales.delete' | 'sales.refund'
  | 'customers.view' | 'customers.create' | 'customers.edit' | 'customers.delete'
  | 'suppliers.view' | 'suppliers.create' | 'suppliers.edit' | 'suppliers.delete'
  | 'expenses.view' | 'expenses.create' | 'expenses.edit' | 'expenses.delete'
  | 'loans.view' | 'loans.create' | 'loans.edit' | 'loans.delete'
  | 'invoices.view' | 'invoices.create' | 'invoices.edit' | 'invoices.delete' | 'invoices.credit_note'
  | 'commissions.view' | 'commissions.manage'
  | 'users.view' | 'users.create' | 'users.edit' | 'users.delete' | 'users.permissions'
  | 'settings.view' | 'settings.edit'
  | 'warehouses.view' | 'warehouses.create' | 'warehouses.edit' | 'warehouses.delete'
  | 'reports.view'
  | 'ai.view' | 'ai.use'
  | 'transfer.view' | 'transfer.create';

export interface Role {
  id: string;
  name: string;
  label: string;
  description: string;
  is_system: number;
  tenantId: string | null;
  createdAt: string;
}

export interface Permission {
  id: string;
  key: PermissionKey;
  module: string;
  label: string;
  description: string;
  createdAt: string;
}

export interface RolePermission {
  id: string;
  roleId: string;
  permissionId: string;
  allowed: number;
  permission?: Permission;
}

export interface UserRole {
  id: string;
  userId: string;
  roleId: string;
  role?: Role;
}

// Extended user with resolved permissions
export interface UserWithPermissions extends User {
  roles: Role[];
  permissions: string[];
}

// Multi-tenant module types
export interface ModuleDefinition {
  key: string;
  label: string;
  description: string;
  icon: string;
  is_core: boolean;
  display_order: number;
}

export interface PlanModule {
  id: string;
  planId: string;
  moduleKey: string;
  enabled: boolean;
  module?: ModuleDefinition;
}

export interface TenantModule {
  id: string;
  tenantId: string;
  moduleKey: string;
  enabled: boolean;
}
