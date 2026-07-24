import { useState, useMemo, memo, FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Plus, Trash2, Edit, Search, Phone, Mail, Award, ShieldAlert, UserCheck, Building2, PhoneCall } from 'lucide-react';
import type { Customer, Supplier } from '../types';
import { useDB, useApp } from '../context';
import { formatCurrency } from '../utils';
import { buildCustomerFromForm, buildSupplierFromForm, createEmptyCustomerForm, createEmptySupplierForm, filterCustomers, filterSuppliers } from '../services/customers';
import { ConfirmDialog } from './shared/ConfirmDialog';

function CustomersInner() {
  const { db, handleUpdateCustomers, handleUpdateSuppliers } = useDB();
  const { activeTenantId } = useApp();

  const activeTenant = useMemo(() => db.tenants.find(t => t.id === activeTenantId), [db.tenants, activeTenantId]);
  const tenantCustomers = useMemo(() => db.customers.filter(c => c.tenantId === activeTenantId), [db.customers, activeTenantId]);
  const tenantSuppliers = useMemo(() => db.suppliers.filter(s => s.tenantId === activeTenantId), [db.suppliers, activeTenantId]);

  const [activeTab, setActiveTab] = useState<'clients' | 'suppliers'>('clients');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);

  const [clientForm, setClientForm] = useState(createEmptyCustomerForm);
  const [supplierForm, setSupplierForm] = useState(createEmptySupplierForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filteredCustomers = useMemo(() => filterCustomers(tenantCustomers, searchTerm), [tenantCustomers, searchTerm]);
  const filteredSuppliers = useMemo(() => filterSuppliers(tenantSuppliers, searchTerm), [tenantSuppliers, searchTerm]);

  const handleOpenCreate = () => {
    setEditingItem(null);
    if (activeTab === 'clients') setClientForm(createEmptyCustomerForm());
    else setSupplierForm(createEmptySupplierForm());
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: any) => {
    setEditingItem(item);
    if (activeTab === 'clients') setClientForm({ name: item.name, phone: item.phone || '', email: item.email || '', loyaltyPoints: item.loyaltyPoints || 0, outstandingDebt: item.outstandingDebt || 0 });
    else setSupplierForm({ name: item.name, contactName: item.contactName || '', phone: item.phone || '', email: item.email || '' });
    setIsModalOpen(true);
  };

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    if (activeTab === 'clients') {
      if (!clientForm.name.trim()) return;
      if (editingItem) {
        handleUpdateCustomers(db.customers.map(c => c.id === editingItem.id ? { ...c, name: clientForm.name, phone: clientForm.phone, email: clientForm.email, loyaltyPoints: Number(clientForm.loyaltyPoints), outstandingDebt: Number(clientForm.outstandingDebt) } : c));
      } else {
        handleUpdateCustomers([...db.customers, buildCustomerFromForm(clientForm, activeTenantId)]);
      }
    } else {
      if (!supplierForm.name.trim()) return;
      if (editingItem) {
        handleUpdateSuppliers(db.suppliers.map(s => s.id === editingItem.id ? { ...s, name: supplierForm.name, contactName: supplierForm.contactName, phone: supplierForm.phone, email: supplierForm.email } : s));
      } else {
        handleUpdateSuppliers([...db.suppliers, buildSupplierFromForm(supplierForm, activeTenantId)]);
      }
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    setDeleteId(id);
  };

  const formatted = (val: number) => formatCurrency(val, activeTenant?.currency);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div><h1 className="text-xl font-bold font-display text-white">Clients & Fournisseurs</h1><p className="text-xs text-gray-400">Suivi des portefeuilles clients, fidélité, encours et annuaire des grossistes</p></div>
        <button onClick={handleOpenCreate} className="flex items-center gap-1.5 bg-brand-blue hover:bg-blue-600 transition text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-lg shadow-blue-500/15">
          <Plus className="w-4 h-4" /> {activeTab === 'clients' ? 'Nouveau Client' : 'Nouveau Fournisseur'}
        </button>
      </div>

      <div className="flex border-b border-gray-800">
        <button onClick={() => { setActiveTab('clients'); setSearchTerm(''); }} className={`px-5 py-2.5 text-xs font-semibold border-b-2 transition ${activeTab === 'clients' ? 'border-brand-blue text-white bg-blue-500/5' : 'border-transparent text-gray-400 hover:text-white'}`}>
          Portefeuille Clients & Fidélité ({tenantCustomers.length})
        </button>
        <button onClick={() => { setActiveTab('suppliers'); setSearchTerm(''); }} className={`px-5 py-2.5 text-xs font-semibold border-b-2 transition ${activeTab === 'suppliers' ? 'border-brand-blue text-white bg-blue-500/5' : 'border-transparent text-gray-400 hover:text-white'}`}>
          Annuaire des Fournisseurs ({tenantSuppliers.length})
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input type="text" placeholder={activeTab === 'clients' ? "Rechercher par nom, téléphone, email..." : "Rechercher un fournisseur, contact..."} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-gray-900 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl pl-9 pr-4 py-2.5 outline-none transition" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {activeTab === 'clients' ? (
          filteredCustomers.length > 0 ? filteredCustomers.map(cust => (
            <div key={cust.id} className="bg-gray-900 border border-gray-800 p-4.5 rounded-2xl flex flex-col justify-between hover:border-gray-700 transition relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-xl pointer-events-none"></div>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-blue-500/10 border border-blue-500/10 flex items-center justify-center font-bold text-brand-blue text-xs">{cust.name[0]}</div>
                  <div><h3 className="text-sm font-bold text-gray-200">{cust.name}</h3><span className="text-[9px] text-gray-500 font-mono">Inscrit le : {cust.createdAt?.split('T')[0] || '2026-01-01'}</span></div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => handleOpenEdit(cust)} className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition"><Edit className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDelete(cust.id)} className="p-1.5 hover:bg-red-950 hover:text-red-400 rounded-lg text-gray-500 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div className="mt-4 space-y-1 text-xs text-gray-400">
                {cust.phone && <p className="flex items-center gap-1.5 font-mono text-[11px] text-gray-300"><Phone className="w-3.5 h-3.5 text-gray-600" /> {cust.phone}</p>}
                {cust.email && <p className="flex items-center gap-1.5 font-mono text-[11px] text-gray-400"><Mail className="w-3.5 h-3.5 text-gray-600" /> {cust.email}</p>}
              </div>
              <div className="mt-4.5 pt-3 border-t border-gray-800 flex justify-between items-center text-xs">
                <div className="bg-blue-500/5 border border-blue-500/10 px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-brand-blue font-bold font-mono text-[11px]"><Award className="w-3.5 h-3.5" /> {cust.loyaltyPoints} pts</div>
                {cust.outstandingDebt > 0 ? (
                  <div className="bg-red-500/5 border border-red-500/10 px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-red-400 font-bold font-mono text-[11px]"><ShieldAlert className="w-3.5 h-3.5" /> {formatted(cust.outstandingDebt)} dû</div>
                ) : (
                  <div className="bg-emerald-500/5 border border-emerald-500/10 px-2.5 py-1 rounded-lg flex items-center gap-1 text-brand-green font-semibold text-[10px]"><UserCheck className="w-3.5 h-3.5" /> Solde en règle</div>
                )}
              </div>
            </div>
          )) : (
            <div className="col-span-full py-12 text-center bg-gray-900/40 border border-gray-800 rounded-2xl"><Users className="w-10 h-10 text-gray-800 mx-auto mb-2" /><p className="text-xs text-gray-500">Aucun client trouvé.</p></div>
          )
        ) : (
          filteredSuppliers.length > 0 ? filteredSuppliers.map(sup => (
            <div key={sup.id} className="bg-gray-900 border border-gray-800 p-4.5 rounded-2xl flex flex-col justify-between hover:border-gray-700 transition relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl pointer-events-none"></div>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center font-bold text-brand-green text-xs"><Building2 className="w-4 h-4" /></div>
                  <div><h3 className="text-sm font-bold text-gray-200">{sup.name}</h3><p className="text-[10px] text-gray-500 font-mono">Contact : {sup.contactName || 'N/A'}</p></div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => handleOpenEdit(sup)} className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition"><Edit className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDelete(sup.id)} className="p-1.5 hover:bg-red-950 hover:text-red-400 rounded-lg text-gray-500 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-gray-800 space-y-1.5 text-xs text-gray-400 font-mono">
                {sup.phone && <p className="flex items-center gap-1.5 text-gray-300"><PhoneCall className="w-3.5 h-3.5 text-gray-600 font-sans" /> {sup.phone}</p>}
                {sup.email && <p className="flex items-center gap-1.5 text-gray-400"><Mail className="w-3.5 h-3.5 text-gray-600 font-sans" /> {sup.email}</p>}
              </div>
              <div className="mt-3 text-right"><span className="text-[9px] text-emerald-500 bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10 font-bold uppercase tracking-wider">Grossiste Référencé</span></div>
            </div>
          )) : (
            <div className="col-span-full py-12 text-center bg-gray-900/40 border border-gray-800 rounded-2xl"><Building2 className="w-10 h-10 text-gray-800 mx-auto mb-2" /><p className="text-xs text-gray-500">Aucun grossiste ou fournisseur enregistré.</p></div>
          )
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-gray-900 border border-gray-800 p-6 rounded-2xl max-w-md w-full">
              <div className="flex justify-between items-center pb-3 border-b border-gray-800 mb-4">
                <h3 className="text-base font-bold font-display text-white">{editingItem ? 'Modifier' : 'Créer'} {activeTab === 'clients' ? 'un Client' : 'un Fournisseur'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white">✕</button>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                {activeTab === 'clients' ? (
                  <>
                    <div><label className="block text-xs font-medium text-gray-400 mb-1">Nom Complet *</label><input type="text" required value={clientForm.name} onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })} placeholder="ex: Marie Curie" className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none" /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-xs font-medium text-gray-400 mb-1">Téléphone</label><input type="text" value={clientForm.phone} onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })} placeholder="+33 6 ..." className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none font-mono" /></div>
                      <div><label className="block text-xs font-medium text-gray-400 mb-1">Email</label><input type="email" value={clientForm.email} onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })} placeholder="marie@curie.fr" className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none font-mono" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-xs font-medium text-gray-400 mb-1">Points Fidélité</label><input type="number" min="0" value={clientForm.loyaltyPoints} onChange={(e) => setClientForm({ ...clientForm, loyaltyPoints: Number(e.target.value) })} className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none font-mono" /></div>
                      <div><label className="block text-xs font-medium text-gray-400 mb-1">Dette Outstanding ({activeTenant?.currency})</label><input type="number" min="0" step="any" value={clientForm.outstandingDebt} onChange={(e) => setClientForm({ ...clientForm, outstandingDebt: Number(e.target.value) })} className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none font-mono" /></div>
                    </div>
                  </>
                ) : (
                  <>
                    <div><label className="block text-xs font-medium text-gray-400 mb-1">Nom du Fournisseur *</label><input type="text" required value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} placeholder="ex: Alliance Pharma Distribution" className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none" /></div>
                    <div><label className="block text-xs font-medium text-gray-400 mb-1">Nom du Contact Associé</label><input type="text" value={supplierForm.contactName} onChange={(e) => setSupplierForm({ ...supplierForm, contactName: e.target.value })} placeholder="ex: Marc Lefebvre" className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none" /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-xs font-medium text-gray-400 mb-1">Téléphone Direct</label><input type="text" value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} placeholder="+33 1 ..." className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none font-mono" /></div>
                      <div><label className="block text-xs font-medium text-gray-400 mb-1">Email Commandes</label><input type="email" value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} placeholder="commandes@grossiste.fr" className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none font-mono" /></div>
                    </div>
                  </>
                )}
                <div className="pt-3 border-t border-gray-800 flex justify-end gap-3">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2.5 bg-gray-800 hover:bg-gray-750 text-gray-300 text-xs font-semibold rounded-xl">Annuler</button>
                  <button type="submit" className="px-5 py-2.5 bg-brand-blue hover:bg-blue-600 text-white text-xs font-semibold rounded-xl">Enregistrer</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={deleteId !== null}
        title="Confirmation"
        message="Voulez-vous supprimer cette fiche ?"
        confirmLabel="Supprimer"
        onConfirm={() => {
          if (activeTab === 'clients') handleUpdateCustomers(db.customers.filter(c => c.id !== deleteId));
          else handleUpdateSuppliers(db.suppliers.filter(s => s.id !== deleteId));
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

export default memo(CustomersInner);
