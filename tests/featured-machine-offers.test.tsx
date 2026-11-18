import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { EquipmentCards } from '../components/equipment/EquipmentCatalog';
import MachineOfferSummary, { featuredPackageOffers } from '../components/equipment/MachineOfferSummary';
import { publicProduct } from './helpers/yarbo-preorder-fixture';
import type { CatalogProduct } from '../lib/catalog/types';

function yarbo() {
  const product = publicProduct();
  product.publicPromotion = { context: 'ids', message: 'OLD FAMILY PROMOTION', imageUrl: '/old-family-promotion.png' };
  return product;
}
function pacman(product: CatalogProduct) {
  return { ...product, id: 'pacman', slug: 'yarbo-pac-man', name: 'Yarbo PAC-MAN Snow Blower', adminManaged: true, packages: [], variants: [] };
}
test('Our Machines groups special editions beneath their assigned brand without losing details link', () => {
  const product = yarbo();
  const html = renderToStaticMarkup(<EquipmentCards products={[pacman(product), product]} aftermarketEnabled={false} featuredBrands />);
  assert.equal((html.match(/<article/g) ?? []).length, 2); // Yarbo and accessories
  assert.match(html, /href="\/equipment\/yarbo-pac-man"/);
  assert.match(html, /Yarbo PAC-MAN Snow Blower/);
  assert.doesNotMatch(html, /OLD FAMILY PROMOTION|old-family-promotion.png/);
});
test('separate equipment index retains its existing presentation', () => {
  const product = yarbo();
  const html = renderToStaticMarkup(<EquipmentCards products={[pacman(product), product]} aftermarketEnabled={false} />);
  assert.equal((html.match(/<article/g) ?? []).length, 3);
  assert.match(html, /OLD FAMILY PROMOTION/);
});
test('Yarbo sale offers use exact selectable package/core amounts and do not borrow parent promotion', () => {
  const product = yarbo();
  const offers = featuredPackageOffers(product);
  assert.equal(offers.length, 7);
  assert.equal(offers.find((offer) => offer.id === 'yarbo-pro-snow:y40p')?.price.currentPriceCents, 899900);
  const html = renderToStaticMarkup(<MachineOfferSummary product={product} />);
  assert.match(html, /Core only, starting at/);
  assert.match(html, /Current package sales/);
  assert.match(html, /\$8,999/);
  assert.doesNotMatch(html, /OLD FAMILY PROMOTION/);
});
test('expired and unavailable package/core sales are not advertised as active offers', () => {
  const product = yarbo();
  product.packages.forEach((pkg) => { pkg.saleIsActive = false; pkg.corePrices?.forEach((price) => { price.saleIsActive = false; }); });
  assert.equal(featuredPackageOffers(product).length, 0);
  assert.doesNotMatch(renderToStaticMarkup(<MachineOfferSummary product={product} />), /Current package sales/);
  const unavailable = yarbo(); unavailable.variants.forEach((core) => { core.isAvailable = false; });
  assert.equal(featuredPackageOffers(unavailable).length, 0);
  const unavailablePackage = yarbo(); unavailablePackage.packages.forEach((pkg) => { pkg.isAvailable = false; });
  assert.equal(featuredPackageOffers(unavailablePackage).length, 0);
});
test('Lymow shows both priced configurations rather than a misleading parent amount', () => {
  const product = yarbo(); product.slug = 'lymow-one-plus';
  product.variants = product.variants.map((variant, i) => ({ ...variant, isAvailable: true, name: i === 0 ? '5A Configuration' : '10A Configuration', showPublicPrice: true, contactForPricing: false, currentPriceCents: i === 0 ? 239900 : 249900, saleIsActive: true }));
  const html = renderToStaticMarkup(<MachineOfferSummary product={product} />);
  for (const value of ['5A Configuration', '10A Configuration', '$2,399', '$2,499']) assert.ok(html.includes(value));
});
test('desktop and mobile explicitly enable the same featured presentation', () => {
  for (const path of ['components/home/DesktopHomepage.tsx', 'components/mobile/MobileHomepage.tsx']) assert.match(readFileSync(path, 'utf8'), /<EquipmentCatalog featuredBrands \/>/);
  assert.doesNotMatch(readFileSync('app/equipment/page.tsx', 'utf8'), /featuredBrands/);
});

test('Our Machines cards are information-only for every brand, not just Lymow and Yarbo', () => {
  const source = yarbo();
  const lymow = { ...source, id: 'lymow', slug: 'lymow-one-plus', brand: 'Lymow', name: 'Lymow One Plus' };
  const pandag = { ...source, id: 'pandag', slug: 'pandag-g1', brand: 'Pandag', name: 'Pandag G1' };
  const futureBrand = { ...source, id: 'future', slug: 'future-machine', brand: 'Future Brand', name: 'Future Machine', adminManaged: true };
  const products = [lymow, source, pandag, futureBrand].map((product) => ({
    ...product,
    homepageSummary: `Information about ${product.brand}.`,
    imageUrl: `/test/${product.id}.png`,
    publicPromotion: { context: 'ids' as const, message: 'Free Pistol and SALE GIFT PROMOTION', imageUrl: '/test/promotion-only.png' },
    variants: product.variants.map((variant) => ({ ...variant, promotionLabel: 'SALE LABEL', publicPromotion: { context: 'sale' as const, message: 'FREE VARIANT GIFT', imageUrl: '/test/variant-promo.png' } })),
  }));
  const unchanged = JSON.stringify(products);
  const html = renderToStaticMarkup(<EquipmentCards products={products} aftermarketEnabled={false} featuredBrands />);
  assert.doesNotMatch(html, /\$|Starting at|Core only|Sale Price|Current package sales|MSRP|Everyday Low Price|SALE LABEL|Free Pistol|SALE GIFT PROMOTION|FREE VARIANT GIFT|promotion-only\.png|variant-promo\.png|Commercial Quote|Request a Quote/);
  for (const product of products) {
    assert.ok(html.includes(product.name));
    assert.ok(html.includes(`Information about ${product.brand}.`));
    assert.ok(html.includes(`/test/${product.id}.png`));
    assert.ok(html.includes(`href="/equipment/${product.slug}"`));
  }
  assert.equal(JSON.stringify(products), unchanged);
});

test('information-only cards preserve unavailable state, full-description fallback, and availability links', () => {
  const product = { ...yarbo(), isAvailable: false, homepageSummary: null, fullDescription: 'Tracked equipment for difficult terrain.' };
  const html = renderToStaticMarkup(<EquipmentCards products={[product]} aftermarketEnabled={false} featuredBrands />);
  assert.match(html, /Unavailable|Currently Unavailable/);
  assert.match(html, /Tracked equipment for difficult terrain/);
  assert.match(html, /View Details/);
  assert.doesNotMatch(html, /\$|OLD FAMILY PROMOTION/);
  const checkAvailability = { ...product, id: 'special', slug: 'yarbo-refurbished-core', adminManaged: true, brand: 'Other' };
  const checkHtml = renderToStaticMarkup(<EquipmentCards products={[checkAvailability]} aftermarketEnabled={false} featuredBrands />);
  assert.match(checkHtml, /Check Availability/);
});

test('separate equipment cards retain their price, promotion, and commercial quote content', () => {
  const product = yarbo();
  const pandag = { ...product, id: 'pandag', slug: 'pandag-g1', brand: 'Pandag', name: 'Pandag G1' };
  const html = renderToStaticMarkup(<EquipmentCards products={[product, pandag]} aftermarketEnabled={false} />);
  assert.match(html, /Starting at|\$3,749/);
  assert.match(html, /OLD FAMILY PROMOTION/);
  assert.match(html, /Contact IDS for a Commercial Quote Today/);
  assert.match(html, /Request a Quote/);
});

test('Our Machines no longer schedules price-only catalog refreshes', () => {
  const source = readFileSync('components/equipment/EquipmentCatalog.tsx', 'utf8');
  assert.doesNotMatch(source, /MachineOfferSummary|nextPackageSaleBoundaryDelay|Refreshing current equipment prices|visibilitychange|setRefreshing/);
  assert.match(source, /fetchCatalog\(\{ signal: controller.signal \}\)/);
});
