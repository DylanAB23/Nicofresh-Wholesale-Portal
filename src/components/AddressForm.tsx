import { useState } from 'react';
import { X } from 'lucide-react';
import type { CustomerAddress } from '../lib/database.types';

interface AddressFormProps {
  address?: CustomerAddress;
  onSave: (address: Partial<CustomerAddress>) => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function AddressForm({ address, onSave, onCancel, loading = false }: AddressFormProps) {
  const [formData, setFormData] = useState({
    company: address?.company || '',
    street1: address?.street1 || '',
    street2: address?.street2 || '',
    city: address?.city || '',
    state: address?.state || '',
    zip: address?.zip || '',
    country: address?.country || 'GB',
    is_default: address?.is_default || false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.street1.trim()) newErrors.street1 = 'Street address is required';
    if (!formData.city.trim()) newErrors.city = 'City is required';
    if (!formData.zip.trim()) newErrors.zip = 'Postal code is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSave(formData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Company */}
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Company (optional)</label>
          <input
            type="text"
            value={formData.company}
            onChange={(e) => setFormData({ ...formData, company: e.target.value })}
            placeholder="Company name"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* Street 1 */}
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            Street Address <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.street1}
            onChange={(e) => setFormData({ ...formData, street1: e.target.value })}
            placeholder="Street address"
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
              errors.street1 ? 'border-red-300 focus:ring-red-500' : 'border-gray-200 focus:ring-brand-500'
            }`}
          />
          {errors.street1 && <p className="text-xs text-red-500 mt-1">{errors.street1}</p>}
        </div>

        {/* Street 2 */}
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Apartment, suite, etc. (optional)</label>
          <input
            type="text"
            value={formData.street2}
            onChange={(e) => setFormData({ ...formData, street2: e.target.value })}
            placeholder="Apartment, suite, floor, etc."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* City */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            City <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.city}
            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
            placeholder="City"
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
              errors.city ? 'border-red-300 focus:ring-red-500' : 'border-gray-200 focus:ring-brand-500'
            }`}
          />
          {errors.city && <p className="text-xs text-red-500 mt-1">{errors.city}</p>}
        </div>

        {/* State */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">State/Province (optional)</label>
          <input
            type="text"
            value={formData.state}
            onChange={(e) => setFormData({ ...formData, state: e.target.value })}
            placeholder="State/Province"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* Zip */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            Postal Code <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.zip}
            onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
            placeholder="Postal code"
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
              errors.zip ? 'border-red-300 focus:ring-red-500' : 'border-gray-200 focus:ring-brand-500'
            }`}
          />
          {errors.zip && <p className="text-xs text-red-500 mt-1">{errors.zip}</p>}
        </div>

        {/* Country */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Country</label>
          <select
            value={formData.country}
            onChange={(e) => setFormData({ ...formData, country: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="GB">United Kingdom</option>
            <option value="US">United States</option>
            <option value="CA">Canada</option>
            <option value="AU">Australia</option>
            <option value="NZ">New Zealand</option>
            <option value="IE">Ireland</option>
            <option value="FR">France</option>
            <option value="DE">Germany</option>
            <option value="IT">Italy</option>
            <option value="ES">Spain</option>
            <option value="NL">Netherlands</option>
            <option value="BE">Belgium</option>
            <option value="AT">Austria</option>
            <option value="CH">Switzerland</option>
            <option value="SE">Sweden</option>
            <option value="NO">Norway</option>
            <option value="DK">Denmark</option>
            <option value="FI">Finland</option>
            <option value="PL">Poland</option>
            <option value="CZ">Czech Republic</option>
          </select>
        </div>
      </div>

      {/* Set as default checkbox */}
      <div className="flex items-center gap-2 pt-2">
        <input
          type="checkbox"
          id="is_default"
          checked={formData.is_default}
          onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
          className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
        />
        <label htmlFor="is_default" className="text-sm text-gray-700">
          Set as default address
        </label>
      </div>

      {/* Buttons */}
      <div className="flex gap-3 pt-4 border-t border-gray-100">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors font-medium"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
        >
          {loading ? 'Saving...' : 'Save Address'}
        </button>
      </div>
    </form>
  );
}
