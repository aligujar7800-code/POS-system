import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cmd } from '../lib/utils';
import { useToast } from '../components/ui/Toaster';
import { Layers, Plus, Search, Trash2, Edit2, ChevronDown, ChevronRight, Users, ShoppingBag, Baby, FolderOpen, Save, X } from 'lucide-react';

interface Category {
  id: number;
  name: string;
  parent_id?: number | null;
  product_count?: number;
}

const MAIN_CAT_ICONS: Record<string, React.ReactNode> = {
  Men: <Users style={{ width: 22, height: 22 }} />,
  Women: <ShoppingBag style={{ width: 22, height: 22 }} />,
  Kids: <Baby style={{ width: 22, height: 22 }} />,
};

const MAIN_CAT_COLORS: Record<string, { bg: string; border: string; text: string; accent: string }> = {
  Men: { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af', accent: '#3b82f6' },
  Women: { bg: '#fdf2f8', border: '#fbcfe8', text: '#9d174d', accent: '#ec4899' },
  Kids: { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534', accent: '#22c55e' },
};

export default function CategoriesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(100); // default expand Men
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [newSubName, setNewSubName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  // Fetch main categories (Men, Women, Kids)
  const { data: mainCategories = [], isLoading: mainLoading } = useQuery<Category[]>({
    queryKey: ['main-categories'],
    queryFn: () => cmd('get_main_categories'),
  });

  // Fetch sub-categories for the expanded main category
  const { data: subCategories = [], isLoading: subLoading } = useQuery<Category[]>({
    queryKey: ['sub-categories', expandedId],
    queryFn: () => cmd('get_sub_categories', { parentId: expandedId }),
    enabled: expandedId !== null,
  });

  const handleAddSub = async (parentId: number) => {
    if (!newSubName.trim()) return;
    try {
      await cmd('create_category', { name: newSubName.trim(), parentId });
      toast('Sub-category created!', 'success');
      setNewSubName('');
      setAddingTo(null);
      qc.invalidateQueries({ queryKey: ['sub-categories'] });
      qc.invalidateQueries({ queryKey: ['main-categories'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
    } catch (err: any) {
      toast(err.toString(), 'error');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure? Products under this sub-category will become uncategorized.')) return;
    try {
      await cmd('delete_category', { id });
      toast('Sub-category deleted', 'success');
      qc.invalidateQueries({ queryKey: ['sub-categories'] });
      qc.invalidateQueries({ queryKey: ['main-categories'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
    } catch (err: any) {
      toast(err.toString(), 'error');
    }
  };

  const handleRename = async (id: number) => {
    if (!editName.trim()) return;
    try {
      await cmd('update_category', { id, name: editName.trim() });
      toast('Category renamed', 'success');
      setEditingId(null);
      setEditName('');
      qc.invalidateQueries({ queryKey: ['sub-categories'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
    } catch (err: any) {
      toast(err.toString(), 'error');
    }
  };

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto', background: '#f8fafc' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <Layers style={{ width: 22, height: 22 }} />
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0 }}>Product Categories</h1>
            <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>Manage Men, Women & Kids categories and their sub-categories</p>
          </div>
        </div>
      </div>

      {mainLoading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Loading categories...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 800 }}>
          {mainCategories.map((main) => {
            const isExpanded = expandedId === main.id;
            const colors = MAIN_CAT_COLORS[main.name] || MAIN_CAT_COLORS.Men;
            const icon = MAIN_CAT_ICONS[main.name] || <FolderOpen style={{ width: 22, height: 22 }} />;

            return (
              <div key={main.id} style={{ borderRadius: 16, border: `2px solid ${isExpanded ? colors.accent : colors.border}`, overflow: 'hidden', transition: 'all 0.25s', boxShadow: isExpanded ? `0 8px 30px ${colors.accent}22` : 'none' }}>
                {/* Main Category Header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : main.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: '20px 24px',
                    background: isExpanded ? colors.bg : '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{
                    width: 48, height: 48, borderRadius: 14,
                    background: isExpanded ? colors.accent : colors.bg,
                    color: isExpanded ? '#fff' : colors.text,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s',
                    boxShadow: isExpanded ? `0 4px 12px ${colors.accent}44` : 'none',
                  }}>
                    {icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: colors.text }}>{main.name}</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                      {main.product_count || 0} sub-categories
                    </div>
                  </div>
                  <div style={{ color: colors.accent, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
                    <ChevronDown style={{ width: 22, height: 22 }} />
                  </div>
                </button>

                {/* Sub-Categories List */}
                {isExpanded && (
                  <div style={{ borderTop: `1px solid ${colors.border}`, background: '#fff' }}>
                    {subLoading ? (
                      <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Loading...</div>
                    ) : (
                      <>
                        <div style={{ padding: '8px 16px' }}>
                          {subCategories.length === 0 ? (
                            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 14, fontStyle: 'italic' }}>
                              No sub-categories yet. Add one below.
                            </div>
                          ) : (
                            subCategories.map((sub) => (
                              <div
                                key={sub.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '12px 16px',
                                  borderRadius: 10,
                                  margin: '4px 0',
                                  transition: 'all 0.15s',
                                  background: '#f8fafc',
                                  border: '1px solid transparent',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = colors.bg;
                                  e.currentTarget.style.borderColor = colors.border;
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#f8fafc';
                                  e.currentTarget.style.borderColor = 'transparent';
                                }}
                              >
                                {editingId === sub.id ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                                    <input
                                      autoFocus
                                      value={editName}
                                      onChange={(e) => setEditName(e.target.value)}
                                      onKeyDown={(e) => e.key === 'Enter' && handleRename(sub.id)}
                                      style={{ flex: 1, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, outline: 'none' }}
                                    />
                                    <button onClick={() => handleRename(sub.id)} style={{ background: colors.accent, color: '#fff', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
                                      <Save style={{ width: 14, height: 14 }} /> Save
                                    </button>
                                    <button onClick={() => { setEditingId(null); setEditName(''); }} style={{ background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}>
                                      <X style={{ width: 14, height: 14 }} />
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: colors.accent }} />
                                      <span style={{ fontWeight: 600, color: '#1e293b', fontSize: 14 }}>{sub.name}</span>
                                      <span style={{ fontSize: 12, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 10, fontWeight: 500 }}>
                                        {sub.product_count || 0} products
                                      </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: 0.5, transition: 'opacity 0.15s' }}
                                      onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                      onMouseLeave={(e) => e.currentTarget.style.opacity = '0.5'}
                                    >
                                      <button
                                        onClick={() => { setEditingId(sub.id); setEditName(sub.name); }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: '#64748b', borderRadius: 6 }}
                                        title="Rename"
                                      >
                                        <Edit2 style={{ width: 15, height: 15 }} />
                                      </button>
                                      <button
                                        onClick={() => handleDelete(sub.id)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: '#ef4444', borderRadius: 6 }}
                                        title="Delete"
                                      >
                                        <Trash2 style={{ width: 15, height: 15 }} />
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))
                          )}
                        </div>

                        {/* Add Sub-Category */}
                        <div style={{ padding: '12px 16px', borderTop: `1px solid ${colors.border}` }}>
                          {addingTo === main.id ? (
                            <div style={{ display: 'flex', gap: 8 }}>
                              <input
                                autoFocus
                                value={newSubName}
                                onChange={(e) => setNewSubName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddSub(main.id)}
                                placeholder={`New ${main.name} sub-category...`}
                                style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none' }}
                              />
                              <button
                                onClick={() => handleAddSub(main.id)}
                                style={{ background: colors.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                              >
                                Add
                              </button>
                              <button
                                onClick={() => { setAddingTo(null); setNewSubName(''); }}
                                style={{ background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setAddingTo(main.id); setNewSubName(''); }}
                              style={{
                                width: '100%',
                                padding: '10px 16px',
                                border: `2px dashed ${colors.border}`,
                                borderRadius: 10,
                                background: 'transparent',
                                color: colors.text,
                                cursor: 'pointer',
                                fontWeight: 600,
                                fontSize: 13,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                transition: 'all 0.15s',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                            >
                              <Plus style={{ width: 16, height: 16 }} /> Add Sub-Category to {main.name}
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
