import { invoke } from '@tauri-apps/api/core';

// Type-safe wrapper around Tauri invoke
export async function cmd<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    // Check if we are running in Tauri
    const isTauri = typeof window !== 'undefined' && 
      (window.hasOwnProperty('__TAURI_INTERNALS__') || 
       window.hasOwnProperty('__TAURI__') || 
       window.hasOwnProperty('__TAURI_IPC__'));

    if (isTauri) {
      return await invoke<T>(command, args);
    }

    // Fallback for browser testing
    console.warn(`Browser Mock: ${command}`, args);
    
    // Mock Authentication
    if (command === 'authenticate_user') {
      return { id: 1, username: 'admin', role: 'admin', is_active: 1 } as any;
    }
    
    // State-ful mocks for browser testing
    const getStorage = (key: string) => JSON.parse(localStorage.getItem(`mock_${key}`) || '[]');
    const setStorage = (key: string, val: any) => localStorage.setItem(`mock_${key}`, JSON.stringify(val));

    if (command === 'get_all_categories') {
      const cats = getStorage('categories');
      const products = getStorage('products');
      return cats.map((c: any) => ({
        ...c,
        product_count: products.filter((p: any) => p.category_id === c.id).length
      }));
    }
    if (command === 'create_category') {
      const cats = getStorage('categories');
      if (cats.some((c: any) => c.name === args?.name)) {
        throw new Error('Category already exists');
      }
      const newCat = { id: Date.now(), name: args?.name, parent_id: args?.parent_id };
      setStorage('categories', [...cats, newCat]);
      return newCat.id as any;
    }

    if (command === 'get_all_products') {
      return getStorage('products');
    }

    if (command === 'get_product_variants') {
      const variants = getStorage('variants');
      return variants.filter((v: any) => v.product_id === (args?.productId ?? args?.product_id));
    }

    if (command === 'get_product_by_id') {
      const products = getStorage('products');
      return products.find((p: any) => p.id === args?.id) || null;
    }

    if (command === 'create_product') {
      const products = getStorage('products');
      const cats = getStorage('categories');
      const vars = getStorage('variants');
      const payload: any = args?.payload;
      if (products.some((p: any) => p.sku === payload.sku)) {
        throw new Error('SKU already exists');
      }
      const category = cats.find((c: any) => c.id === payload.category_id);
      const newProd = { 
        id: Date.now(), 
        ...payload, 
        category_name: category ? category.name : null,
        barcode: payload.barcode || Math.floor(Math.random() * 10000000000).toString(),
        total_stock: (args?.variants as any[])?.reduce((a, b) => a + (b.quantity || 0), 0) || 0
      };
      setStorage('products', [...products, newProd]);
      
      const newVars = (args?.variants as any[])?.map(v => ({
         id: Math.floor(Math.random() * 1000000),
         product_id: newProd.id,
         ...v
      })) || [];
      setStorage('variants', [...vars, ...newVars]);

      return newProd.id as any;
    }

    if (command === 'add_inward_stock') {
      const products = getStorage('products');
      const vars = getStorage('variants');
      const payload: any = args?.payload;
      
      payload.items.forEach((item: any) => {
        // Update product cost
        const pIdx = products.findIndex((p: any) => p.id === item.product_id);
        if (pIdx !== -1) {
          products[pIdx].cost_price = item.cost_price;
          products[pIdx].total_stock += item.quantity;
        }
        
        // Update variant qty
        const vIdx = vars.findIndex((v: any) => v.id === item.variant_id);
        if (vIdx !== -1) {
          vars[vIdx].quantity += item.quantity;
        }
      });
      
      setStorage('products', products);
      setStorage('variants', vars);
      
      // Add to history
      const history = getStorage('inward_history');
      const newEntries = payload.items.map((item: any) => ({
        id: Date.now(),
        product_name: products.find((p: any) => p.id === item.product_id)?.name || 'Unknown',
        variant_info: `${item.size || ''} ${item.color || ''}`.trim() || 'Default',
        received_qty: item.quantity,
        cost_price: item.cost_price,
        total_cost: item.quantity * item.cost_price,
        supplier_name: payload.supplier_name || 'Unknown',
        date: new Date().toISOString()
      }));
      setStorage('inward_history', [...history, ...newEntries]);
      
      return null as any;
    }

    if (command === 'get_inward_history') {
      return getStorage('inward_history');
    }

    if (command === 'create_sale') {
      const sales = getStorage('sales');
      const products = getStorage('products');
      const vars = getStorage('variants');
      const payload: any = args?.payload;

      const newSale = {
        id: Date.now(),
        ...payload,
        invoice_no: `INV-${Date.now()}`,
        created_at: new Date().toISOString()
      };

      // Simple stock deduction in mock
      payload.items.forEach((item: any) => {
        const vIdx = vars.findIndex((v: any) => v.id === item.variant_id);
        if (vIdx !== -1) vars[vIdx].quantity -= item.quantity;
        
        const pIdx = products.findIndex((p: any) => p.id === item.product_id);
        if (pIdx !== -1) products[pIdx].total_stock -= item.quantity;
      });

      setStorage('sales', [...sales, newSale]);
      setStorage('products', products);
      setStorage('variants', vars);

      return [newSale.id, newSale.invoice_no] as any;
    }

    if (command === 'create_bulk_products') {
        const products = getStorage('products');
        const vars = getStorage('variants');
        const payload: any[] = args?.items as any[];
        
        payload.forEach(item => {
            const newP = {
                id: Date.now() + Math.random(),
                ...item,
                total_stock: item.variants?.reduce((a: any, b: any) => a + (b.quantity || 0), 0) || 0,
                barcode: item.barcode || Math.floor(Math.random() * 10000000000).toString(),
            };
            products.push(newP);
            if (item.variants) {
                item.variants.forEach((v: any) => {
                    vars.push({
                        id: Math.floor(Math.random() * 1000000),
                        product_id: newP.id,
                        ...v
                    });
                });
            }
        });

        setStorage('products', products);
        setStorage('variants', vars);
        return true as any;
    }
    
    if (command === 'search_products') {
      const products = getStorage('products');
      const q = (args?.query as string || '').toLowerCase();
      return products.filter((p: any) => 
        p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
      );
    }
    
    // Add other mocks as needed
    if (command === 'get_all_settings') return {} as any;
    if (command === 'get_total_udhaar') return 0 as any;
    if (command === 'get_todays_collections') return 0 as any;
    if (command === 'get_top_defaulters') return [] as any;
    if (command === 'get_low_stock_products') return [] as any;

    return [] as any;
  } catch (e) {
    if (typeof window !== 'undefined' && !(window as any).__TAURI_INTERNALS__) {
      console.warn(`Browser Mock (Fallback): ${command}`, args);
      if (command === 'authenticate_user') return { id: 1, username: 'admin', role: 'admin', is_active: 1 } as any;
      return [] as any;
    }
    throw e;
  }
}

// Helper for formatting currency
export function formatCurrency(amount: number, symbol = 'Rs.'): string {
  return `${symbol} ${amount.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Format date to readable string
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-PK', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

// cn utility (class merge)
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
