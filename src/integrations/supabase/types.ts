export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      attachments: {
        Row: {
          file_key: string
          file_size: number | null
          id: string
          mime_type: string | null
          module_name: string
          ref_id: string
          ref_table: string
          uploaded_at: string | null
          uploaded_by: string | null
          url: string
        }
        Insert: {
          file_key: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          module_name: string
          ref_id: string
          ref_table: string
          uploaded_at?: string | null
          uploaded_by?: string | null
          url: string
        }
        Update: {
          file_key?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          module_name?: string
          ref_id?: string
          ref_table?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
          url?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          id: string
          ip_address: string | null
          module: string
          new_data: Json | null
          old_data: Json | null
          ref_id: string | null
          ref_no: string | null
          ref_table: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          module: string
          new_data?: Json | null
          old_data?: Json | null
          ref_id?: string | null
          ref_no?: string | null
          ref_table?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          module?: string
          new_data?: Json | null
          old_data?: Json | null
          ref_id?: string | null
          ref_no?: string | null
          ref_table?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          code: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          code: string
          created_at: string | null
          created_by: string | null
          credit_limit: number | null
          customer_type: string | null
          deleted_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          jabatan: string | null
          name: string
          notes: string | null
          npwp: string | null
          phone: string | null
          pic: string | null
          terms_payment: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          code: string
          created_at?: string | null
          created_by?: string | null
          credit_limit?: number | null
          customer_type?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          jabatan?: string | null
          name: string
          notes?: string | null
          npwp?: string | null
          phone?: string | null
          pic?: string | null
          terms_payment?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          created_at?: string | null
          created_by?: string | null
          credit_limit?: number | null
          customer_type?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          jabatan?: string | null
          name?: string
          notes?: string | null
          npwp?: string | null
          phone?: string | null
          pic?: string | null
          terms_payment?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      inventory_batches: {
        Row: {
          batch_no: string
          created_at: string | null
          expired_date: string | null
          id: string
          product_id: string
          qty_on_hand: number
          updated_at: string | null
        }
        Insert: {
          batch_no: string
          created_at?: string | null
          expired_date?: string | null
          id?: string
          product_id: string
          qty_on_hand?: number
          updated_at?: string | null
        }
        Update: {
          batch_no?: string
          created_at?: string | null
          expired_date?: string | null
          id?: string
          product_id?: string
          qty_on_hand?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_order_headers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          discount: number | null
          expected_delivery_date: string | null
          grand_total: number | null
          id: string
          is_deleted: boolean | null
          notes: string | null
          plan_date: string
          plan_number: string
          po_document_url: string | null
          shipping_cost: number | null
          status: string
          supplier_id: string
          tax_rate: number | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          discount?: number | null
          expected_delivery_date?: string | null
          grand_total?: number | null
          id?: string
          is_deleted?: boolean | null
          notes?: string | null
          plan_date?: string
          plan_number: string
          po_document_url?: string | null
          shipping_cost?: number | null
          status?: string
          supplier_id: string
          tax_rate?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          discount?: number | null
          expected_delivery_date?: string | null
          grand_total?: number | null
          id?: string
          is_deleted?: boolean | null
          notes?: string | null
          plan_date?: string
          plan_number?: string
          po_document_url?: string | null
          shipping_cost?: number | null
          status?: string
          supplier_id?: string
          tax_rate?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_order_headers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_order_items: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          plan_order_id: string
          planned_qty: number
          product_id: string
          qty_received: number | null
          qty_remaining: number | null
          subtotal: number | null
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          plan_order_id: string
          planned_qty: number
          product_id: string
          qty_received?: number | null
          qty_remaining?: number | null
          subtotal?: number | null
          unit_price: number
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          plan_order_id?: string
          planned_qty?: number
          product_id?: string
          qty_received?: number | null
          qty_remaining?: number | null
          subtotal?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_order_items_plan_order_id_fkey"
            columns: ["plan_order_id"]
            isOneToOne: false
            referencedRelation: "plan_order_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          category_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean | null
          location_rack: string | null
          max_stock: number | null
          min_stock: number | null
          name: string
          photo_url: string | null
          purchase_price: number
          selling_price: number | null
          sku: string | null
          supplier_id: string | null
          unit_id: string | null
          updated_at: string | null
        }
        Insert: {
          barcode?: string | null
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean | null
          location_rack?: string | null
          max_stock?: number | null
          min_stock?: number | null
          name: string
          photo_url?: string | null
          purchase_price?: number
          selling_price?: number | null
          sku?: string | null
          supplier_id?: string | null
          unit_id?: string | null
          updated_at?: string | null
        }
        Update: {
          barcode?: string | null
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean | null
          location_rack?: string | null
          max_stock?: number | null
          min_stock?: number | null
          name?: string
          photo_url?: string | null
          purchase_price?: number
          selling_price?: number | null
          sku?: string | null
          supplier_id?: string | null
          unit_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sales_order_headers: {
        Row: {
          allocation_type: string
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string
          customer_po_number: string
          deleted_at: string | null
          deleted_by: string | null
          delivery_deadline: string
          discount: number | null
          grand_total: number | null
          id: string
          is_deleted: boolean | null
          notes: string | null
          order_date: string
          po_document_url: string | null
          project_instansi: string
          sales_name: string
          sales_order_number: string
          ship_to_address: string | null
          shipping_cost: number | null
          status: string
          tax_rate: number | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          allocation_type: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id: string
          customer_po_number: string
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_deadline: string
          discount?: number | null
          grand_total?: number | null
          id?: string
          is_deleted?: boolean | null
          notes?: string | null
          order_date?: string
          po_document_url?: string | null
          project_instansi: string
          sales_name: string
          sales_order_number: string
          ship_to_address?: string | null
          shipping_cost?: number | null
          status?: string
          tax_rate?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          allocation_type?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string
          customer_po_number?: string
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_deadline?: string
          discount?: number | null
          grand_total?: number | null
          id?: string
          is_deleted?: boolean | null
          notes?: string | null
          order_date?: string
          po_document_url?: string | null
          project_instansi?: string
          sales_name?: string
          sales_order_number?: string
          ship_to_address?: string | null
          shipping_cost?: number | null
          status?: string
          tax_rate?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_headers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_items: {
        Row: {
          created_at: string | null
          discount: number | null
          id: string
          notes: string | null
          ordered_qty: number
          product_id: string
          qty_delivered: number | null
          qty_remaining: number | null
          sales_order_id: string
          subtotal: number | null
          tax_rate: number | null
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          discount?: number | null
          id?: string
          notes?: string | null
          ordered_qty: number
          product_id: string
          qty_delivered?: number | null
          qty_remaining?: number | null
          sales_order_id: string
          subtotal?: number | null
          tax_rate?: number | null
          unit_price: number
        }
        Update: {
          created_at?: string | null
          discount?: number | null
          id?: string
          notes?: string | null
          ordered_qty?: number
          product_id?: string
          qty_delivered?: number | null
          qty_remaining?: number | null
          sales_order_id?: string
          subtotal?: number | null
          tax_rate?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_order_headers"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          created_at: string | null
          id: string
          key: string
          updated_at: string | null
          value: Json | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json | null
        }
        Relationships: []
      }
      stock_adjustment_items: {
        Row: {
          adjustment_id: string
          adjustment_qty: number
          batch_id: string
          created_at: string | null
          id: string
          notes: string | null
          product_id: string
        }
        Insert: {
          adjustment_id: string
          adjustment_qty: number
          batch_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          product_id: string
        }
        Update: {
          adjustment_id?: string
          adjustment_qty?: number
          batch_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustment_items_adjustment_id_fkey"
            columns: ["adjustment_id"]
            isOneToOne: false
            referencedRelation: "stock_adjustments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustment_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustment_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustments: {
        Row: {
          adjustment_date: string
          adjustment_number: string
          approved_at: string | null
          approved_by: string | null
          attachment_url: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_deleted: boolean | null
          reason: string
          rejected_reason: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          adjustment_date?: string
          adjustment_number: string
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean | null
          reason: string
          rejected_reason?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          adjustment_date?: string
          adjustment_number?: string
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean | null
          reason?: string
          rejected_reason?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      stock_in_headers: {
        Row: {
          created_at: string | null
          created_by: string | null
          delivery_note_url: string | null
          id: string
          notes: string | null
          plan_order_id: string
          received_date: string
          stock_in_number: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          delivery_note_url?: string | null
          id?: string
          notes?: string | null
          plan_order_id: string
          received_date?: string
          stock_in_number: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          delivery_note_url?: string | null
          id?: string
          notes?: string | null
          plan_order_id?: string
          received_date?: string
          stock_in_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_in_headers_plan_order_id_fkey"
            columns: ["plan_order_id"]
            isOneToOne: false
            referencedRelation: "plan_order_headers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_in_items: {
        Row: {
          batch_no: string
          created_at: string | null
          expired_date: string | null
          id: string
          plan_order_item_id: string
          product_id: string
          qty_received: number
          stock_in_id: string
        }
        Insert: {
          batch_no: string
          created_at?: string | null
          expired_date?: string | null
          id?: string
          plan_order_item_id: string
          product_id: string
          qty_received: number
          stock_in_id: string
        }
        Update: {
          batch_no?: string
          created_at?: string | null
          expired_date?: string | null
          id?: string
          plan_order_item_id?: string
          product_id?: string
          qty_received?: number
          stock_in_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_in_items_plan_order_item_id_fkey"
            columns: ["plan_order_item_id"]
            isOneToOne: false
            referencedRelation: "plan_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_in_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_in_items_stock_in_id_fkey"
            columns: ["stock_in_id"]
            isOneToOne: false
            referencedRelation: "stock_in_headers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_out_headers: {
        Row: {
          created_at: string | null
          created_by: string | null
          delivery_date: string
          delivery_note_url: string | null
          id: string
          notes: string | null
          sales_order_id: string
          stock_out_number: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          delivery_date?: string
          delivery_note_url?: string | null
          id?: string
          notes?: string | null
          sales_order_id: string
          stock_out_number: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          delivery_date?: string
          delivery_note_url?: string | null
          id?: string
          notes?: string | null
          sales_order_id?: string
          stock_out_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_out_headers_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_order_headers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_out_items: {
        Row: {
          batch_id: string
          created_at: string | null
          id: string
          product_id: string
          qty_out: number
          sales_order_item_id: string
          stock_out_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string | null
          id?: string
          product_id: string
          qty_out: number
          sales_order_item_id: string
          stock_out_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string | null
          id?: string
          product_id?: string
          qty_out?: number
          sales_order_item_id?: string
          stock_out_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_out_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_out_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_out_items_sales_order_item_id_fkey"
            columns: ["sales_order_item_id"]
            isOneToOne: false
            referencedRelation: "sales_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_out_items_stock_out_id_fkey"
            columns: ["stock_out_id"]
            isOneToOne: false
            referencedRelation: "stock_out_headers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transactions: {
        Row: {
          batch_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          product_id: string
          quantity: number
          reference_id: string | null
          reference_number: string | null
          reference_type: string | null
          transaction_type: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id: string
          quantity: number
          reference_id?: string | null
          reference_number?: string | null
          reference_type?: string | null
          transaction_type: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          reference_id?: string | null
          reference_number?: string | null
          reference_type?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transactions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          city: string | null
          code: string
          contact_person: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          npwp: string | null
          phone: string | null
          terms_payment: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          code: string
          contact_person?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          npwp?: string | null
          phone?: string | null
          terms_payment?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          contact_person?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          npwp?: string | null
          phone?: string | null
          terms_payment?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      units: {
        Row: {
          code: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      plan_order_approve: { Args: { order_id: string }; Returns: Json }
      plan_order_cancel: { Args: { order_id: string }; Returns: Json }
      plan_order_create: {
        Args: { attachment_meta?: Json; header_data: Json; items_data: Json }
        Returns: Json
      }
      plan_order_soft_delete: { Args: { order_id: string }; Returns: Json }
      plan_order_update: {
        Args: { header_data: Json; items_data: Json; order_id: string }
        Returns: Json
      }
      sales_order_approve: { Args: { order_id: string }; Returns: Json }
      sales_order_cancel: { Args: { order_id: string }; Returns: Json }
      sales_order_create: {
        Args: { attachment_meta?: Json; header_data: Json; items_data: Json }
        Returns: Json
      }
      sales_order_soft_delete: { Args: { order_id: string }; Returns: Json }
      sales_order_update: {
        Args: { header_data: Json; items_data: Json; order_id: string }
        Returns: Json
      }
      stock_adjustment_approve: {
        Args: { adjustment_id: string }
        Returns: Json
      }
      stock_adjustment_create: {
        Args: { attachment_meta?: Json; header_data: Json; items_data: Json }
        Returns: Json
      }
      stock_adjustment_reject: {
        Args: { adjustment_id: string; reject_reason?: string }
        Returns: Json
      }
      stock_adjustment_soft_delete: {
        Args: { adjustment_id: string }
        Returns: Json
      }
      stock_adjustment_update: {
        Args: { adjustment_id: string; header_data: Json; items_data: Json }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "admin"
        | "finance"
        | "purchasing"
        | "warehouse"
        | "sales"
        | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "super_admin",
        "admin",
        "finance",
        "purchasing",
        "warehouse",
        "sales",
        "viewer",
      ],
    },
  },
} as const
