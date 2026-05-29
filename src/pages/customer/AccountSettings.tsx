import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import AddressForm from '../../components/AddressForm';
import type { CustomerAddress } from '../../lib/database.types';

export default function AccountSettings() {
  const { user, profile } = useAuth();
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    if (user) fetchAddresses();
  }, [user]);

  async function fetchAddresses() {
    setLoading(true);
    const { data } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('profile_id', user?.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    setAddresses(data || []);
    setLoading(false);
  }

  async function saveAddress(formData: Partial<CustomerAddress>) {
    setSaving(true);
    try {
      if (editingId) {
        // Update existing address
        const { error } = await supabase
          .from('customer_addresses')
          .update({
            ...formData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingId);

        if (error) throw error;

        // If setting as default, unset others
        if (formData.is_default) {
          await supabase
            .from('customer_addresses')
            .update({ is_default: false })
            .eq('profile_id', user?.id)
            .neq('id', editingId);
        }
      } else {
        // Create new address
        const { error } = await supabase.from('customer_addresses').insert({
          profile_id: user?.id,
          ...formData,
        });

        if (error) throw error;

        // If setting as default, unset others
        if (formData.is_default) {
          await supabase
            .from('customer_addresses')
            .update({ is_default: false })
            .eq('profile_id', user?.id)
            .neq('profile_id', 'null'); // This is a bit hacky but avoids needing the new address ID
        }
      }

      setEditingId(null);
      setShowAddForm(false);
      await fetchAddresses();
    } catch (error) {
      console.error('Error saving address:', error);
    } finally {
      setSaving(false);
    }
  }

  async function deleteAddress(id: string) {
    if (!confirm('Are you sure you want to delete this address?')) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('customer_addresses')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchAddresses();
    } catch (error) {
      console.error('Error deleting address:', error);
    } finally {
      setSaving(false);
    }
  }

  async function setDefault(id: string) {
    setSaving(true);
    try {
      // Unset all as default for this user
      await supabase
        .from('customer_addresses')
        .update({ is_default: false })
        .eq('profile_id', user?.id);

      // Set this one as default
      const { error } = await supabase
        .from('customer_addresses')
        .update({ is_default: true })
        .eq('id', id);

      if (error) throw error;
      await fetchAddresses();
    } catch (error) {
      console.error('Error setting default address:', error);
    } finally {
      setSaving(false);
    }
  }

  const editingAddress = editingId ? addresses.find(a => a.id === editingId) : undefined;

  if (!user || !profile) {
    return <div className="p-8 text-center text-gray-500">Please log in to view account settings</div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Account Settings</h1>
        <p className="text-gray-500 mt-1">Manage your account and delivery addresses</p>
      </div>

      {/* Account Info */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Store Name</p>
            <p className="font-medium text-gray-900">{profile.store_name}</p>
          </div>
          <div>
            <p className="text-gray-500">Contact Name</p>
            <p className="font-medium text-gray-900">{profile.contact_name}</p>
          </div>
          <div>
            <p className="text-gray-500">Email</p>
            <p className="font-medium text-gray-900">{profile.email}</p>
          </div>
          <div>
            <p className="text-gray-500">Phone</p>
            <p className="font-medium text-gray-900">{profile.phone || 'Not provided'}</p>
          </div>
          <div>
            <p className="text-gray-500">Account Status</p>
            <p className="font-medium text-gray-900 capitalize">{profile.status}</p>
          </div>
          <div>
            <p className="text-gray-500">Net-30 Limit</p>
            <p className="font-medium text-gray-900">£{profile.net30_limit?.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Addresses */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Delivery Addresses</h2>
          {!showAddForm && !editingId && (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={16} /> Add Address
            </button>
          )}
        </div>

        {/* Add/Edit Form */}
        {(showAddForm || editingId) && (
          <div className="mb-8 p-6 bg-gray-50 rounded-lg border border-gray-100">
            <AddressForm
              address={editingAddress}
              onSave={saveAddress}
              onCancel={() => {
                setShowAddForm(false);
                setEditingId(null);
              }}
              loading={saving}
            />
          </div>
        )}

        {/* Addresses List */}
        {loading ? (
          <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded animate-pulse" />)}</div>
        ) : addresses.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No saved addresses yet</p>
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={16} /> Add Your First Address
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {addresses.map(address => (
              <div key={address.id} className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
                {/* Default badge */}
                {address.is_default && (
                  <div className="flex items-center gap-1 text-xs font-medium text-emerald-600 mb-2">
                    <Check size={12} /> Default Address
                  </div>
                )}

                {/* Address details */}
                <div className="space-y-1 mb-4 text-sm">
                  {address.company && <p className="font-medium text-gray-900">{address.company}</p>}
                  <p className="text-gray-700">{address.street1}</p>
                  {address.street2 && <p className="text-gray-700">{address.street2}</p>}
                  <p className="text-gray-700">
                    {address.city}
                    {address.state && `, ${address.state}`} {address.zip}
                  </p>
                  <p className="text-gray-700">{address.country}</p>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {!address.is_default && (
                    <button
                      onClick={() => setDefault(address.id)}
                      disabled={saving}
                      className="flex-1 px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      Set as Default
                    </button>
                  )}
                  <button
                    onClick={() => setEditingId(address.id)}
                    disabled={saving}
                    className="px-3 py-2 text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => deleteAddress(address.id)}
                    disabled={saving}
                    className="px-3 py-2 text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
