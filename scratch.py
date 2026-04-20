import re
import os

with open('src/pages/Inward.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Add Fuse
code = code.replace(
    "import { useQueryClient, useQuery } from '@tanstack/react-query';",
    "import { useQueryClient, useQuery } from '@tanstack/react-query';\nimport Fuse from 'fuse.js';"
)

old_state = """  // ── Category-Based Flow State ───────────────────────────
  const [selectedMainCat, setSelectedMainCat] = useState<number | null>(null);
  const [selectedSubCat, setSelectedSubCat] = useState<Category | null>(null);

  // ── Article Entry Form ──────────────────────────────────
  const [articleNumber, setArticleNumber] = useState('');
  const [productName, setProductName] = useState('');
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [quantity, setQuantity] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [salePrice, setSalePrice] = useState('');"""

new_state = """  // ── Search-Based Flow State ───────────────────────────
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  // We temporarily hold variant inputs here maps variant_id to { quantity, cost_price, sale_price }
  const [variantInputs, setVariantInputs] = useState<Record<number, { quantity: string, cost_price: string, sale_price: string }>>({});
  
  // Adding new variant on the fly
  const [showAddVariant, setShowAddVariant] = useState(false);
  const [newColor, setNewColor] = useState('');
  const [newSize, setNewSize] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newCost, setNewCost] = useState('');
  const [newSale, setNewSale] = useState('');"""

code = code.replace(old_state, new_state)

old_queries = """  const { data: subCategories = [], isLoading: subLoading } = useQuery<Category[]>({
    queryKey: ['sub-categories', selectedMainCat],
    queryFn: () => cmd('get_sub_categories', { parentId: selectedMainCat }),
    enabled: selectedMainCat !== null,
  });"""

new_queries = """  const { data: allProducts = [], isLoading: prodLoading } = useQuery<any[]>({
    queryKey: ['products'],
    queryFn: () => cmd('get_all_products'),
  });

  const { data: productVariants = [], isLoading: variantsLoading } = useQuery<any[]>({
    queryKey: ['product_variants', selectedProduct?.id],
    queryFn: () => cmd('get_product_variants', { productId: selectedProduct?.id }),
    enabled: !!selectedProduct,
  });

  const fuse = new Fuse(allProducts, { keys: ['name', 'sku', 'article_number', 'barcode'], threshold: 0.3 });
  const searchResults = productSearch ? fuse.search(productSearch).map(r => r.item) : allProducts.slice(0, 15);"""

code = code.replace(old_queries, new_queries)

article_effect = """  // ── Generate article number on sub-category select ─────
  useEffect(() => {
    if (selectedSubCat) {
      cmd<string>('generate_article_number').then(art => {
        setArticleNumber(art);
        // Auto-set product name based on category
        const mainCat = MAIN_CATEGORIES.find(c => c.id === selectedMainCat);
        setProductName(`${mainCat?.name || ''} ${selectedSubCat.name}`);
      }).catch(console.error);
    }
  }, [selectedSubCat]);"""

code = code.replace(article_effect, "")

old_handle = """  const handleAddToCart = () => {
    if (!articleNumber.trim()) { toast('Article number is required', 'error'); return; }
    if (!selectedMainCat || !selectedSubCat) { toast('Please select a category', 'error'); return; }
    if (!quantity || parseInt(quantity) <= 0) { toast('Quantity must be at least 1', 'error'); return; }
    if (!costPrice || parseFloat(costPrice) <= 0) { toast('Cost price is required', 'error'); return; }
    if (!salePrice || parseFloat(salePrice) <= 0) { toast('Sale price is required', 'error'); return; }

    const mainCat = MAIN_CATEGORIES.find(c => c.id === selectedMainCat);

    const newItem: CartItem = {
      cart_id: Math.random().toString(36).substring(7),
      article_number: articleNumber.trim(),
      main_category: mainCat?.name || '',
      sub_category_id: selectedSubCat.id,
      sub_category_name: selectedSubCat.name,
      product_name: productName.trim() || `${mainCat?.name} ${selectedSubCat.name}`,
      color: color.trim(),
      size: size.trim(),
      quantity: parseInt(quantity),
      cost_price: parseFloat(costPrice),
      sale_price: parseFloat(salePrice),
    };

    setCart(prev => [...prev, newItem]);

    // Reset form but keep category selection and article number
    setColor('');
    setSize('');
    setQuantity('');

    toast('Item added to voucher!', 'success');
  };"""

new_handle = """  const handleAddToCart = () => {
    if (!selectedProduct) return;
    
    let added = 0;
    const newItems: CartItem[] = [];
    
    Object.entries(variantInputs).forEach(([vIdStr, inputs]) => {
      const q = parseInt(inputs.quantity) || 0;
      if (q > 0) {
        const v = productVariants.find((pv:any) => pv.id === parseInt(vIdStr));
        if (v) {
          newItems.push({
            cart_id: Math.random().toString(36).substring(7),
            article_number: selectedProduct.article_number || '',
            main_category: selectedProduct.category_name || '',
            sub_category_id: selectedProduct.category_id || 0,
            sub_category_name: selectedProduct.category_name || '',
            product_name: selectedProduct.name || '',
            color: v.color || '',
            size: v.size || '',
            quantity: q,
            cost_price: parseFloat(inputs.cost_price) || 0,
            sale_price: parseFloat(inputs.sale_price) || 0,
          });
          added++;
        }
      }
    });

    if (showAddVariant) {
      const q = parseInt(newQuantity) || 0;
      if (q > 0) {
        newItems.push({
          cart_id: Math.random().toString(36).substring(7),
          article_number: selectedProduct.article_number || '',
          main_category: selectedProduct.category_name || '',
          sub_category_id: selectedProduct.category_id || 0,
          sub_category_name: selectedProduct.category_name || '',
          product_name: selectedProduct.name || '',
          color: newColor.trim() || '',
          size: newSize.trim() || '',
          quantity: q,
          cost_price: parseFloat(newCost) || parseFloat(selectedProduct.cost_price) || 0,
          sale_price: parseFloat(newSale) || parseFloat(selectedProduct.sale_price) || 0,
        });
        added++;
        setNewColor(''); setNewSize(''); setNewQuantity(''); setNewCost(''); setNewSale('');
        setShowAddVariant(false);
      }
    }

    if (added === 0) {
      toast('Please enter a valid quantity for at least one variation.', 'error');
      return;
    }

    setCart(prev => [...prev, ...newItems]);
    setVariantInputs({});
    toast(`${added} items added to voucher!`, 'success');
  };"""

code = code.replace(old_handle, new_handle)

old_reset = """  const resetFlow = () => {
    setSelectedMainCat(null);
    setSelectedSubCat(null);
    setArticleNumber('');
    setProductName('');
    setColor('');
    setSize('');
    setQuantity('');
    setCostPrice('');
    setSalePrice('');
  };"""

new_reset = """  const resetFlow = () => {
    setSelectedProduct(null);
    setProductSearch('');
    setVariantInputs({});
    setShowAddVariant(false);
  };"""

code = code.replace(old_reset, new_reset)

# Now regex replace the giant render block from Step 1 to Add Button
start_marker = "{/* Step 1: Main Category Selection */}"
end_marker = "{/* Add Button */}"

new_ui = """{/* Step 1: Search & Select Product */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>1</div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>Select Product</h3>
              {selectedProduct && (
                <button onClick={resetFlow} style={{ marginLeft: 'auto', fontSize: 12, color: '#6366f1', background: '#eef2ff', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontWeight: 600 }}>
                  Change Product
                </button>
              )}
            </div>
            
            {!selectedProduct ? (
              <div>
                <div style={{ position: 'relative', marginBottom: 12 }}>
                  <Search style={{ position: 'absolute', left: 12, top: 12, width: 16, height: 16, color: '#94a3b8' }} />
                  <input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Search by name, article number, or barcode..."
                    style={{ width: '100%', padding: '10px 10px 10px 38px', borderRadius: 8, border: '2px solid #e2e8f0', fontSize: 14, outline: 'none' }}
                  />
                </div>
                <div style={{ maxHeight: 300, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {searchResults.map((p: any) => (
                    <div 
                      key={p.id} 
                      onClick={() => { setSelectedProduct(p); setVariantInputs({}); }}
                      style={{ padding: '12px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: '#1e293b' }}>{p.name}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>Art: {p.article_number || 'N/A'} | Stock: {p.total_stock || 0}</div>
                      </div>
                      <button style={{ padding: '4px 12px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Select</button>
                    </div>
                  ))}
                  {searchResults.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>No products found</div>}
                </div>
              </div>
            ) : (
              <div style={{ padding: '12px 16px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>{selectedProduct.name}</div>
                <div style={{ fontSize: 13, color: '#475569' }}>Article: {selectedProduct.article_number || 'N/A'} | Category: {selectedProduct.category_name || 'N/A'}</div>
              </div>
            )}
          </div>

          {/* Step 2: Receive Stock Variants */}
          {selectedProduct && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, animation: 'fadeIn 0.25s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>2</div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>Stock Receiving Details</h3>
              </div>
              
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 100px 80px', gap: 8, fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 8, padding: '0 4px' }}>
                  <div>Size</div>
                  <div>Color</div>
                  <div>Cost Price</div>
                  <div>Sale Price</div>
                  <div style={{ textAlign: 'center' }}>Receive Qty</div>
                </div>
                
                {variantsLoading ? <div style={{ textAlign: 'center', color: '#94a3b8', padding: 12 }}>Loading variants...</div> : productVariants.map((v: any) => (
                  <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 100px 80px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ padding: '6px 10px', background: '#f8fafc', borderRadius: 6, fontSize: 13, fontWeight: 600 }}>{v.size || 'Default'}</div>
                    <div style={{ padding: '6px 10px', background: '#f8fafc', borderRadius: 6, fontSize: 13, fontWeight: 600 }}>{v.color || 'None'}</div>
                    <input 
                      type="number"
                      value={variantInputs[v.id]?.cost_price ?? (v.variant_price || selectedProduct.cost_price || '')}
                      onChange={(e) => setVariantInputs(prev => ({ ...prev, [v.id]: { ...prev[v.id], cost_price: e.target.value } }))}
                      style={{ padding: '6px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}
                      placeholder="Cost"
                    />
                    <input 
                      type="number"
                      value={variantInputs[v.id]?.sale_price ?? (selectedProduct.sale_price || '')}
                      onChange={(e) => setVariantInputs(prev => ({ ...prev, [v.id]: { ...prev[v.id], sale_price: e.target.value } }))}
                      style={{ padding: '6px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}
                      placeholder="Sale"
                    />
                    <input 
                      type="number"
                      min="0"
                      value={variantInputs[v.id]?.quantity || ''}
                      onChange={(e) => setVariantInputs(prev => ({ ...prev, [v.id]: { ...prev[v.id], quantity: e.target.value } }))}
                      style={{ padding: '6px', borderRadius: 6, border: '2px solid #cbd5e1', fontSize: 14, fontWeight: 700, textAlign: 'center', outlineColor: '#6366f1' }}
                      placeholder="0"
                    />
                  </div>
                ))}
                
                {!showAddVariant && (
                  <button onClick={() => setShowAddVariant(true)} style={{ marginTop: 12, padding: '8px 0', width: '100%', background: 'transparent', border: '1px dashed #cbd5e1', borderRadius: 8, color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    + Receive a completely new Size/Color for this product
                  </button>
                )}
                
                {showAddVariant && (
                  <div style={{ marginTop: 12, padding: 12, background: '#fef2f2', border: '1px dashed #fca5a5', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>New Variation</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 100px 80px', gap: 8, alignItems: 'center' }}>
                      <input placeholder="Size (eg XL)" value={newSize} onChange={e=>setNewSize(e.target.value)} style={{ padding: '6px', borderRadius: 6, border: '1px solid #fecaca', fontSize: 13 }} />
                      <input placeholder="Color (eg Red)" value={newColor} onChange={e=>setNewColor(e.target.value)} style={{ padding: '6px', borderRadius: 6, border: '1px solid #fecaca', fontSize: 13 }} />
                      <input type="number" placeholder="Cost" value={newCost} onChange={e=>setNewCost(e.target.value)} style={{ padding: '6px', borderRadius: 6, border: '1px solid #fecaca', fontSize: 13 }} />
                      <input type="number" placeholder="Sale" value={newSale} onChange={e=>setNewSale(e.target.value)} style={{ padding: '6px', borderRadius: 6, border: '1px solid #fecaca', fontSize: 13 }} />
                      <input type="number" placeholder="0" value={newQuantity} onChange={e=>setNewQuantity(e.target.value)} style={{ padding: '6px', borderRadius: 6, border: '2px solid #ef4444', fontSize: 14, fontWeight: 700, textAlign: 'center' }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Add Button */"""

code = code.split(start_marker)[0] + new_ui + code.split(end_marker)[1]

old_clear_lines = """      setCart([]);
      setSupplierName('');
      setPaymentAmount('');
      setNotes('');
      setSelectedMainCat(null);
      setSelectedSubCat(null);
      setArticleNumber('');
      setProductName('');"""

new_clear_lines = """      setCart([]);
      setSupplierName('');
      setPaymentAmount('');
      setNotes('');
      resetFlow();"""

code = code.replace(old_clear_lines, new_clear_lines)

with open('src/pages/InwardNew.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Rewritten to InwardNew.tsx")
