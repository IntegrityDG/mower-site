import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { catalogImageUpdate } from '../lib/catalog-management/image-update';
import { validateCatalogValues, CatalogManagementError } from '../lib/catalog-management/validation';

const version = '2026-11-16T05:00:00.000Z';
test('image update is a versioned partial edit without identity, pricing, or contents', () => {
  assert.deepEqual(catalogImageUpdate({updatedAt: version}, ' /photos/new.webp '), {expectedUpdatedAt: version, values: {image_url: '/photos/new.webp'}});
  assert.deepEqual(catalogImageUpdate({updatedAt: version}, ' '), {expectedUpdatedAt: version, values: {image_url: null}});
});
test('all four existing record types accept replace and clear with correct storage columns', () => {
  for (const kind of ['products','variants','options','packages'] as const) {
    const column = kind === 'options' ? 'accessory_image_url' : 'image_url';
    assert.deepEqual(validateCatalogValues(kind, {image_url:'/photos/new.webp'}), {[column]:'/photos/new.webp'});
    assert.deepEqual(validateCatalogValues(kind, {image_url:null}), {[column]:null});
    assert.deepEqual(validateCatalogValues(kind, {image_url:''}), {[column]:null});
  }
});
test('replacement preserves record identity and unrelated fields in controlled persistence fixture', () => {
  for (const kind of ['products','variants','options','packages'] as const) {
    const row = {id:'same-id', sku:'same-sku', regular_price_cents:12345, public_status:'active', image_url:'/old.webp', accessory_image_url:'/old.webp'};
    const update = catalogImageUpdate({updatedAt: version}, '/replacement.webp');
    const reloaded = {...row,...validateCatalogValues(kind,update.values)};
    assert.equal(reloaded.id,row.id); assert.equal(reloaded.sku,row.sku);
    assert.equal(reloaded.regular_price_cents,row.regular_price_cents); assert.equal(reloaded.public_status,row.public_status);
    assert.equal(reloaded[kind === 'options' ? 'accessory_image_url' : 'image_url'],'/replacement.webp');
  }
});
test('credential URLs, external protocol-relative paths and executable schemes cannot become image values', () => {
  for (const url of ['//example.com/a.png','/\\example.com/a.png','https://user:password@example.com/a.png','javascript:alert(1)','data:image/svg+xml,test','http://example.com/a.png']) {
    assert.throws(() => validateCatalogValues('products',{image_url:url}), CatalogManagementError);
  }
});
test('public loader projects explicit catalog image before gallery default', () => {
  const src=readFileSync('lib/catalog/load-public-catalog.ts','utf8');
  assert.match(src,/hasPromotion \? galleryImage \?\? savedProductImage : savedProductImage \?\? galleryImage/);
  assert.match(src,/imageUrl: safeCatalogImageUrl\(variant.image_url\)/);
  assert.match(src,/imageUrl: safeCatalogImageUrl\(catalogPackage.image_url\)/);
});
test('image editor only uses authenticated existing catalog mutation and keeps upload/save separate', () => {
 const src=readFileSync('components/admin/CatalogImages.tsx','utf8');
 assert.match(src,/method: "PATCH"/); assert.match(src,/catalogImageUpdate\(item, url\)/);
 assert.match(src,/disabled=\{saving \|\| uploading\}/); assert.match(src,/busy=\{busy\}/);
 const route=readFileSync('app/api/admin/catalog-management/[kind]/[id]/route.ts','utf8');
 assert.match(route,/adminCatalogRequest/);
});

test('image-only server writes compare-and-swap one row without package relationship RPC', async () => {
  const ts = await import('typescript');
  const { runInNewContext } = await import('node:vm');
  const validation = await import('../lib/catalog-management/validation');
  const id = '11111111-1111-4111-8111-111111111111';
  let row: Record<string, unknown> = { id, updated_at: version, retired_at: null, core_selectable: true, regular_price_cents: 12345, sku: 'same', image_url: '/old.webp' };
  const relationships: unknown[] = []; // Missing relationships must stay missing.
  const client = { rpc() { throw new Error('Image update must not call generic catalog RPC'); }, from(table: string) {
    assert.equal(table, 'catalog_packages');
    let patch: Record<string, unknown>; const filters: Record<string, unknown> = {};
    const chain = { update(values: Record<string, unknown>) { patch = values; return chain; }, eq(key: string, value: unknown) { filters[key] = value; return chain; }, is(key: string, value: unknown) { filters[key] = value; return chain; }, select() { return chain; }, async maybeSingle() {
      if (!Object.entries(filters).every(([key, value]) => row[key] === value)) return {data: null, error: null};
      assert.deepEqual(Object.keys(patch).sort(), ['image_url', 'updated_at']);
      row = {...row, ...patch}; return {data: {...row}, error: null};
    } }; return chain;
  } };
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  const compiled = ts.transpileModule(readFileSync('lib/catalog-management/server.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(compiled, { exports, require(name: string) {
    if (name === './validation') return validation;
    if (name === '@/lib/supabase') return {getSupabaseServiceClient: () => client};
    if (name === '@/lib/catalog/load-public-catalog') return {loadPublicCatalog: async () => ({products: []})};
    if (name === './public-result') return {managedCustomerPrice: () => null};
    return {};
  }});
  await exports.updateManagedRecord('packages',id,catalogImageUpdate({updatedAt: version},'/new.webp'));
  assert.equal(row.image_url,'/new.webp'); assert.equal(row.regular_price_cents,12345); assert.equal(row.sku,'same'); assert.equal(relationships.length,0);
  await assert.rejects(exports.updateManagedRecord('packages',id,catalogImageUpdate({updatedAt:version},'/stale.webp')), (error: unknown) => (error as {status:number}).status === 409);
  await exports.updateManagedRecord('packages',id,catalogImageUpdate({updatedAt:row.updated_at as string},''));
  assert.equal(row.image_url,null); assert.equal(relationships.length,0);
});
