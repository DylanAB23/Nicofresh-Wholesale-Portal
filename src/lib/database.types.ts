export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: string;
          store_name: string;
          contact_name: string;
          email: string;
          phone: string | null;
          credit_limit: number;
          current_balance: number;
          net_terms: number;
          net30_limit: number;
          require_upfront: boolean;
          status: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string;
          image_url: string;
          sort_order: number;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['categories']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['categories']['Insert']>;
      };
      products: {
        Row: {
          id: string;
          woo_id: number | null;
          category_id: string | null;
          sku: string;
          name: string;
          type: string;
          parent_sku: string;
          parent_id: string | null;
          description: string;
          short_description: string;
          image_url: string;
          gallery_urls: string[];
          regular_price: number;
          sale_price: number | null;
          wholesale_price: number;
          msrp: number;
          // DB column is stock_qty (WooCommerce name); aliased as stock_quantity in app
          stock_qty: number;
          in_stock: boolean;
          case_quantity: number;
          min_order_quantity: number;
          unit_of_measure: string;
          weight: number;
          categories_raw: string;
          tags: string;
          published: boolean;
          is_active: boolean;
          // WooCommerce attributes
          brand: string;
          nicotine_mg: string;
          e_liquid_style: string;
          colour: string;
          ohm: string;
          pack_size: string;
          ml: string;
          flavour: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['products']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['products']['Insert']>;
      };
      addresses: {
        Row: {
          id: string;
          profile_id: string;
          type: string;
          is_default: boolean;
          company: string;
          street1: string;
          street2: string;
          city: string;
          state: string;
          zip: string;
          country: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['addresses']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['addresses']['Insert']>;
      };
      orders: {
        Row: {
          id: string;
          order_number: string;
          profile_id: string;
          status: string;
          payment_method: string;
          payment_status: string;
          subtotal: number;
          shipping: number;
          tax: number;
          total: number;
          notes: string;
          shipping_name: string;
          shipping_company: string;
          shipping_address: string;
          shipping_city: string;
          shipping_state: string;
          shipping_postcode: string;
          shipping_country: string;
          shipstation_order_id: string;
          shipstation_order_key: string;
          tracking_number: string;
          carrier: string;
          shipped_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['orders']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['orders']['Insert']>;
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string | null;
          sku: string;
          name: string;
          quantity: number;
          unit_price: number;
          total: number;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['order_items']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['order_items']['Insert']>;
      };
      invoices: {
        Row: {
          id: string;
          invoice_number: string;
          order_id: string | null;
          profile_id: string;
          status: string;
          amount_due: number;
          amount_paid: number;
          due_date: string;
          issued_date: string;
          notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['invoices']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['invoices']['Insert']>;
      };
      payments: {
        Row: {
          id: string;
          invoice_id: string;
          profile_id: string;
          amount: number;
          method: string;
          reference: string;
          notes: string;
          paid_at: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['payments']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['payments']['Insert']>;
      };
      portal_settings: {
        Row: {
          id: string;
          net30_min_order: number;
          net30_enabled: boolean;
          default_net_terms: number;
          default_credit_limit: number;
          default_net30_limit: number;
          company_name: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['portal_settings']['Row']>;
        Update: Partial<Database['public']['Tables']['portal_settings']['Row']>;
      };
    };
  };
}

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Category = Database['public']['Tables']['categories']['Row'];
export type Product = Database['public']['Tables']['products']['Row'];
export type Address = Database['public']['Tables']['addresses']['Row'];
export type Order = Database['public']['Tables']['orders']['Row'];
export type OrderItem = Database['public']['Tables']['order_items']['Row'];
export type Invoice = Database['public']['Tables']['invoices']['Row'];
export type Payment = Database['public']['Tables']['payments']['Row'];
export type PortalSettings = Database['public']['Tables']['portal_settings']['Row'];

// Customer saved addresses
export interface CustomerAddress {
  id: string;
  profile_id: string;
  company: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type CartItem = { product: Product; quantity: number };
