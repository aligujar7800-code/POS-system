import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCartStore } from '../stores/cartStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../components/ui/Toaster';

// ─── Normalize text ──────────────────────────────────────────────────
function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()'"؟،۔]/g, '')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ه/g, 'ہ')
    .replace(/ؤ/g, 'و').replace(/ئ/g, 'ی').replace(/ة/g, 'ہ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getWords(text: string): string[] {
  return normalize(text).split(/\s+/).filter(w => w.length > 0);
}

// ─── Urdu → Roman transliteration ───────────────────────────────────
const URDU_TO_ROMAN: Record<string, string> = {
  'ا': 'a', 'آ': 'aa', 'ب': 'b', 'پ': 'p', 'ت': 't', 'ٹ': 't',
  'ث': 's', 'ج': 'j', 'چ': 'ch', 'ح': 'h', 'خ': 'kh', 'د': 'd',
  'ڈ': 'd', 'ذ': 'z', 'ر': 'r', 'ڑ': 'r', 'ز': 'z', 'ژ': 'zh',
  'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'z', 'ط': 't', 'ظ': 'z',
  'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ک': 'k', 'گ': 'g',
  'ل': 'l', 'م': 'm', 'ن': 'n', 'و': 'o', 'ہ': 'h', 'ھ': 'h',
  'ی': 'i', 'ے': 'e', 'ء': '', 'ئ': 'y', 'ؤ': 'o',
};

function urduToRoman(text: string): string {
  return [...text].map(c => URDU_TO_ROMAN[c] ?? c).join('');
}

function consonantSkeleton(text: string): string {
  return text.toLowerCase()
    .replace(/[aeiouy\s\-_.,]/g, '')
    .replace(/j/g, 'ch')
    .replace(/b/g, 'p')
    .replace(/d/g, 't')
    .replace(/z/g, 's')
    .replace(/g/g, 'k');
}

function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(null));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i][j - 1] + 1,
        matrix[i - 1][j] + 1,
        matrix[i - 1][j - 1] + indicator
      );
    }
  }
  return matrix[a.length][b.length];
}

// ─── Number parsing ──────────────────────────────────────────────────
const URDU_NUMBERS: Record<string, number> = {
  'ek': 1, 'aik': 1, 'ایک': 1, '١': 1, '1': 1,
  'do': 2, 'dou': 2, 'دو': 2, '٢': 2, '2': 2,
  'teen': 3, 'tin': 3, 'تین': 3, '٣': 3, '3': 3,
  'char': 4, 'chaar': 4, 'چار': 4, '٤': 4, '4': 4,
  'panch': 5, 'paanch': 5, 'پانچ': 5, '٥': 5, '5': 5,
  'chhe': 6, 'che': 6, 'چھ': 6, '٦': 6, '6': 6,
  'sat': 7, 'saat': 7, 'ساتھ': 7, 'سات': 7, '٧': 7, '7': 7,
  'ath': 8, 'aath': 8, 'آٹھ': 8, '٨': 8, '8': 8,
  'nau': 9, 'no': 9, 'نو': 9, '٩': 9, '9': 9,
  'das': 10, 'dus': 10, 'دس': 10, '١٠': 10, '10': 10,
};

// ─── Core Commands ───────────────────────────────────────────────────
const CHECKOUT_WORDS = new Set([
  'total', 'bill', 'checkout', 'payment', 'pay',
  'ٹوٹل', 'بل', 'چیک', 'پیمنٹ', 'ادائیگی',
]);

const DISCOUNT_WORDS = new Set([
  'discount', 'riayat', 'riyayat',
  'ڈسکاؤنٹ', 'ڈسکاونٹ', 'رعایت', 'ریعایت',
]);

const DELETE_WORDS = new Set([
  'delete', 'hatao', 'remove', 'nikal', 'nikalo', 'cancel',
  'ہٹاؤ', 'ڈیلیٹ', 'ریموو', 'نکال', 'نکالو', 'ہٹا', 'کینسل',
]);

const NAV_MAP: { words: Set<string>; route: string; label: string }[] = [
  { words: new Set(['settings', 'setting', 'سیٹنگ', 'سیٹنگز']), route: '/settings', label: 'Settings' },
  { words: new Set(['inventory', 'stock', 'انوینٹری', 'اسٹاک', 'سٹاک']), route: '/inventory', label: 'Inventory' },
  { words: new Set(['dashboard', 'home', 'ڈیش', 'ہوم']), route: '/sales', label: 'Dashboard' },
  { words: new Set(['report', 'reports', 'رپورٹ', 'رپورٹس']), route: '/reports', label: 'Reports' },
];

const BACKUP_WORDS = new Set(['backup', 'بیک', 'بیکاپ']);
const LOGOUT_WORDS = new Set(['logout', 'signout', 'لاگ', 'سائن', 'بند']);

function hasAnyWord(words: string[], wordSet: Set<string>): boolean {
  return words.some(w => wordSet.has(w));
}

// ─── Types ─────────────────────────────────────────────────────────────
interface SearchProduct {
  id: number;
  name: string;
  sku: string;
  barcode: string | null;
  sale_price: number;
  total_stock: number;
}

interface ProductVariant {
  id: number;
  product_id: number;
  size?: string;
  color?: string;
  quantity: number;
  variant_barcode?: string;
  variant_price?: number;
}

// ─── Strong AI Product Search ──────────────────────────────────────────
// Scans the ENTIRE sentence by splitting it into chunks, supporting multiple independent items.
async function detectProductsInSentence(sentence: string): Promise<Array<{ product: SearchProduct, score: number, qty: number }>> {
  const romanized = urduToRoman(sentence).trim();
  const matchedProducts: Array<{ product: SearchProduct, score: number, qty: number }> = [];

  // 1. Exact string match fallback (Single item)
  try {
    const directResults = await invoke<SearchProduct[]>('search_products', { query: sentence });
    if (directResults && directResults.length > 0) return [{ product: directResults[0], score: 1, qty: 1 }];
    
    if (romanized && romanized !== sentence) {
      const romanResults = await invoke<SearchProduct[]>('search_products', { query: romanized });
      if (romanResults && romanResults.length > 0) return [{ product: romanResults[0], score: 1, qty: 1 }];
    }
  } catch (e) {}

  // 2. Chunk-based Phonetic Presence Matching (Multiple Items)
  try {
    const allProducts = await invoke<SearchProduct[]>('get_all_products');
    if (!allProducts || allProducts.length === 0) return [];

    const splitTokens = [' aur ', ' and ', ' wa ', ' ya ', ',', '،'];
    let chunks = [romanized];
    splitTokens.forEach(token => {
        const newChunks: string[] = [];
        chunks.forEach(chunk => {
            newChunks.push(...chunk.split(token));
        });
        chunks = newChunks;
    });
    chunks = chunks.map(c => c.trim()).filter(c => c.length > 0);

    const extractSkelOrNum = (w: string) => (/^\d+$/.test(w) || URDU_NUMBERS[w]) ? w : consonantSkeleton(w);

    for (const chunk of chunks) {
        const words = chunk.split(' ');
        let qty = 1;
        let remainingWords: string[] = [];
        
        // Extract first number in chunk as quantity
        let qtyFound = false;
        for (const w of words) {
            if (!qtyFound && (/^\d+$/.test(w) || URDU_NUMBERS[w])) {
                qty = URDU_NUMBERS[w] || parseInt(w, 10);
                qtyFound = true;
            } else {
                remainingWords.push(w);
            }
        }
        
        if (remainingWords.length === 0) continue;
        
        let chunkSkeletons = remainingWords.map(extractSkelOrNum).filter(s => s.length > 0);
        if (chunkSkeletons.length === 0) continue;

        let bestMatch: SearchProduct | null = null;
        let bestScore = 0;

        for (const product of allProducts) {
            const productWords = product.name.toLowerCase().split(/\s+/);
            const productSkeletons = productWords.map(extractSkelOrNum).filter(s => s.length > 0);
            
            let matchedProductWords = 0;
            
            for (const pSkel of productSkeletons) {
                if (pSkel.length < 2 && !URDU_NUMBERS[pSkel]) continue;
                
                let bestWordSimilarity = 0;
                for (const sSkel of chunkSkeletons) {
                    if (sSkel.length < 2 && !URDU_NUMBERS[sSkel]) continue;

                    if (sSkel === pSkel) {
                        bestWordSimilarity = 1;
                        break;
                    } else {
                        const distance = levenshteinDistance(sSkel, pSkel);
                        const maxLen = Math.max(sSkel.length, pSkel.length);
                        const similarity = 1 - (distance / maxLen);
                        if (similarity > bestWordSimilarity) bestWordSimilarity = similarity;
                    }
                }
                if (bestWordSimilarity >= 0.7) matchedProductWords++;
            }

            const significantProductWords = productSkeletons.filter(s => s.length >= 2 || URDU_NUMBERS[s]).length;
            if (significantProductWords > 0) {
                const score = matchedProductWords / significantProductWords;
                const adjustedScore = score + (significantProductWords * 0.01);

                if (adjustedScore > bestScore && score >= 0.5) {
                    bestScore = adjustedScore;
                    bestMatch = product;
                }
            }
        }

        if (bestMatch && bestScore >= 0.5) {
            matchedProducts.push({ product: bestMatch, score: bestScore, qty });
        }
    }

    return matchedProducts;
  } catch (e) {
    console.error('Fuzzy search failed:', e);
  }

  return matchedProducts;
}

// ─── Main parser hook ────────────────────────────────────────────────
export function useVoiceCommandParser() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  
  const addItem = useCartStore(state => state.addItem);
  const cartRemoveItem = useCartStore(state => state.removeItem);
  const cartItems = useCartStore(state => state.items);
  const { voice_simple_mode, voice_full_mode, voice_custom_commands } = useSettingsStore();
  const logout = useAuthStore(state => state.logout);

  const parseCommand = useCallback(async (transcribedText: string, forceExecute: boolean = false) => {
    if (!transcribedText) return;

    const words = getWords(transcribedText);
    const normalizedFull = normalize(transcribedText);
    let handled = false;

    let customCommands: { simple?: Record<string, string>, full?: Record<string, string> } = {};
    try {
      customCommands = JSON.parse(voice_custom_commands || '{"simple":{},"full":{}}');
    } catch (e) {}

    const isEnabled = forceExecute || voice_simple_mode || voice_full_mode;

    // === SIMPLE MODE & CORE COMMERCE ===
    if (isEnabled) {
      if (forceExecute || voice_full_mode || location.pathname.includes('/sales')) {
        
        // 1. Exact Intent Checks
        if (hasAnyWord(words, CHECKOUT_WORDS)) {
          window.dispatchEvent(new CustomEvent('VOICE_COMMAND_CHECKOUT'));
          toast('Voice: Checkout ✅', 'success');
          handled = true;
        }
        else if (hasAnyWord(words, DISCOUNT_WORDS)) {
          window.dispatchEvent(new CustomEvent('VOICE_COMMAND_DISCOUNT'));
          toast('Voice: Discount ✅', 'success');
          handled = true;
        }
        
        // 2. PRODUCT-FIRST HEURISTIC MATCHING
        // If it's not checkout or discount, scan the sentence for a product.
        if (!handled) {
          const isDelete = hasAnyWord(words, DELETE_WORDS);
          
          // Don't search if the sentence is completely empty after removing commands
          const searchSentence = transcribedText;
          
          if (searchSentence.length > 0) {
              const results = await detectProductsInSentence(searchSentence);
              
              if (results && results.length > 0) {
                for (const result of results) {
                  const product = result.product;
                  const qty = result.qty;
                  
                  if (isDelete) {
                    // Find this product in the cart and remove it
                    const idx = [...cartItems].reverse().findIndex(item => item.product_id === product.id);
                    if (idx !== -1) {
                       const realIdx = cartItems.length - 1 - idx;
                       cartRemoveItem(realIdx);
                       toast(`Voice: Removed "${product.name}" ✅`, 'success');
                    } else {
                       if (cartItems.length > 0) {
                         cartRemoveItem(cartItems.length - 1);
                         toast('Voice: Last item removed ✅', 'success');
                       } else {
                         toast('Voice: Cart empty hai', 'error');
                       }
                    }
                  } else {
                    // Add to Cart Logic (with Variants)
                    let variants: ProductVariant[] = [];
                    try {
                       variants = await invoke<ProductVariant[]>('get_product_variants', { productId: product.id });
                    } catch (e) {}

                    let finalVariantId = undefined;
                    let finalPrice = product.sale_price;
                    let finalName = product.name;

                    if (variants.length > 0) {
                        if (variants.length === 1) {
                            finalVariantId = variants[0].id;
                            finalPrice = variants[0].variant_price ?? product.sale_price;
                            finalName = `${product.name} (${[variants[0].size, variants[0].color].filter(Boolean).join(' / ')})`;
                        } else {
                            let matchedVariant: ProductVariant | null = null;
                            for (const v of variants) {
                                const hasPrice = v.variant_price && transcribedText.includes(v.variant_price.toString());
                                const hasSize = v.size && transcribedText.toLowerCase().includes(v.size.toLowerCase());
                                const hasColor = v.color && transcribedText.toLowerCase().includes(v.color.toLowerCase());
                                const regexPrice = v.variant_price ? new RegExp(`\\b${v.variant_price}\\b`).test(transcribedText) : false;

                                if (hasSize || hasColor || regexPrice) {
                                    matchedVariant = v;
                                    break;
                                }
                            }

                            if (matchedVariant) {
                                finalVariantId = matchedVariant.id;
                                finalPrice = matchedVariant.variant_price ?? product.sale_price;
                                finalName = `${product.name} (${[matchedVariant.size, matchedVariant.color].filter(Boolean).join(' / ')})`;
                            } else {
                                toast(`Voice: "${product.name}" variant select karein.`, 'info');
                                window.dispatchEvent(new CustomEvent('VOICE_COMMAND_REQUIRE_VARIANT', { detail: { product } }));
                                continue;
                            }
                        }
                    }

                    addItem({
                      product_id: product.id,
                      variant_id: finalVariantId,
                      product_name: finalName,
                      quantity: qty,
                      unit_price: finalPrice,
                      discount: 0,
                      discount_type: 'amount',
                    });
                    toast(`✅ "${finalName}" (x${qty}) cart mein add hua!`, 'success');
                  }
                }
                handled = true;
              }
          }
          
          // Fallback delete if they just said "hatao" without a product name
          if (!handled && isDelete) {
            if (cartItems.length > 0) {
              cartRemoveItem(cartItems.length - 1);
              toast('Voice: Last item removed ✅', 'success');
            } else {
              toast('Voice: Cart empty hai', 'error');
            }
            handled = true;
          }
        }
      }
    }

    // === FULL AI MODE NAVIGATION ===
    if (voice_full_mode && !handled) {
      for (const nav of NAV_MAP) {
        if (hasAnyWord(words, nav.words)) {
          navigate(nav.route);
          toast(`Voice: ${nav.label} ✅`, 'info');
          handled = true;
          break;
        }
      }

      if (!handled && hasAnyWord(words, BACKUP_WORDS)) {
        toast('Voice: Backup start...', 'info');
        try {
          await invoke('cloud_backup_now');
          toast('Voice: Backup complete ✅', 'success');
        } catch (error) {
          toast(`Backup failed: ${String(error)}`, 'error');
        }
        handled = true;
      }
      
      if (!handled && hasAnyWord(words, LOGOUT_WORDS)) {
        logout();
        toast('Voice: Logged out', 'info');
        handled = true;
      }
    }

    // === Custom Commands ===
    if (!handled) {
       const checkCustom = (mapping: Record<string, string> | undefined) => {
          if (!mapping) return false;
          for (const [phrase, action] of Object.entries(mapping)) {
             if (normalizedFull.includes(normalize(phrase))) {
                 navigate(action);
                 toast(`Voice: ${action} ✅`, 'info');
                 return true;
             }
          }
          return false;
       };
       if (voice_full_mode) {
           handled = checkCustom(customCommands.full) || checkCustom(customCommands.simple);
       } else if (voice_simple_mode) {
           handled = checkCustom(customCommands.simple);
       }
    }

    if (!handled && isEnabled) {
       toast(`Samajh nahi aaya — "${transcribedText}"`, 'error');
    }

  }, [navigate, location.pathname, addItem, cartItems, cartRemoveItem, voice_simple_mode, voice_full_mode, voice_custom_commands, logout, toast]);

  return { parseCommand };
}
