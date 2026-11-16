import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { catalogCardImage, safeCatalogImageUrl } from '../lib/catalog/card-image';
import CatalogCardImage from '../components/equipment/CatalogCardImage';
import ProductConfiguration from '../components/customer-paths/purchase/ProductConfiguration';
import { EquipmentSelectionReview, AccessoryOnlyConfiguration, AccessoryOnlyReview } from '../components/customer-paths/purchase/NationwidePurchaseFlow';
import GenericProductDetail from '../components/equipment/GenericProductDetail';
import { publicProduct } from './helpers/yarbo-preorder-fixture';
import type { ProductBuildSelection } from '../lib/catalog/types';

const noop = () => {};
const selection: ProductBuildSelection = { variantId:'y40p', packageId:'yarbo-pro-leaf', optionQuantities:{}, purchaseMode:'complete-system', includeBaseProduct:false };
function fixture() { const p=publicProduct(); p.publicPromotion=null; p.packages=p.packages.filter(x=>x.id==='yarbo-pro-leaf'); p.packages[0].imageUrl='/test/package.webp'; p.packages[0].imageAlt='Exact test package'; return p; }

test('image URL accepts only root-relative or credential-free HTTPS',()=>{
 for(const bad of [null,123,'javascript:alert(1)','data:image/png;base64,a','//other.test/a.png','http://other.test/a.png','/\\evil.test/a','/a\n.png','https://user:pass@other.test/a','https://localhost/a.png','https://127.0.0.1/a.png','/api/image','/admin/photo','/x.png?token=abc','/x.png#secret','/storage/v1/object/sign/photo.png','/%5cevil.png']) assert.equal(safeCatalogImageUrl(bad),null);
 assert.equal(safeCatalogImageUrl('/a.png'),'/a.png'); assert.equal(safeCatalogImageUrl(' https://example.com/a.png '),'https://example.com/a.png');
});
test('replacing saved image updates resolution without changing entry identity',()=>{
 const item={id:'same',name:'Machine',imageUrl:'/old.png'}; assert.equal(catalogCardImage(item)?.src,'/old.png'); item.imageUrl='/new.png'; assert.equal(catalogCardImage(item)?.src,'/new.png'); assert.equal(item.id,'same');
});
test('ordinary image resolution never consumes promotion art or unrelated parent image',()=>{
 assert.equal(catalogCardImage({name:'Package',publicPromotion:{imageUrl:'/promo.png'}}),null);
 assert.equal(catalogCardImage({name:'Package'}, {publicPromotion:{message:'Promo'}}),null);
 assert.equal(catalogCardImage({name:'Package'},{imageUrl:'/wrong-parent.png'})?.src,null);
});
test('missing image placeholder is honest and suppressed cards produce no markup',()=>{
 const html=renderToStaticMarkup(<CatalogCardImage image={catalogCardImage({name:'Unknown package'})}/>); assert.match(html,/Image unavailable/); assert.doesNotMatch(html,/<img|logo.png/);
 assert.equal(renderToStaticMarkup(<CatalogCardImage image={null}/>),'');
});
test('exact module fallbacks are consistent; unknown module has no generic core fallback',()=>{
 assert.match(catalogCardImage({slug:'yarbo-leaf-blower-module',optionGroupId:null}, {slug:'yarbo'})?.src??'',/blower/);
 assert.equal(catalogCardImage({slug:'unknown-module'})?.src,null);
});
test('same package image renders in browsing, build configuration, and review',()=>{
 const p=fixture(); const args={product:p,selection,onSelectVariant:noop,onSelectPackage:noop,onChangeOptionQuantity:noop,onSelectPurchaseMode:noop,onToggleBaseProduct:noop};
 for (const element of [<GenericProductDetail key="browse" product={p}/>,<ProductConfiguration key="build" {...args}/>,<EquipmentSelectionReview key="review" selectedProduct={p} buildSelection={selection}/>]) {
  const html=renderToStaticMarkup(element); assert.match(html,/src="\/test\/package.webp"/); assert.match(html,/alt="Exact test package"/);
 }
});
test('accessory selection and review use the same saved accessory photo',()=>{
 const p=fixture();const option={...p.ungroupedOptions[0],accessoryImageUrl:'/test/accessory.webp',accessoryImageAlt:'Exact accessory'};const props={choices:[{product:p,option}],quantities:{[option.id]:1}};
 for(const element of [<AccessoryOnlyConfiguration key="selection" {...props} onChange={noop}/>,<AccessoryOnlyReview key="review" {...props}/>]) assert.match(renderToStaticMarkup(element),/src="\/test\/accessory.webp"/);
});
test('promotion-bearing packages never gain the ordinary image in new surfaces',()=>{
 const p=fixture(); p.packages[0].publicPromotion={context:'ids',message:'Existing promo',imageUrl:null};
 assert.doesNotMatch(renderToStaticMarkup(<ProductConfiguration product={p} selection={selection} onSelectVariant={noop} onSelectPackage={noop} onChangeOptionQuantity={noop} onSelectPurchaseMode={noop} onToggleBaseProduct={noop}/>),/src="\/test\/package.webp"/);
});

test('promotion gates include core prices, family children and sibling options',()=>{
 const photo={name:'ordinary',imageUrl:'/a.webp'};
 const promo={publicPromotion:{message:'promotion'}};
 for(const parent of [{corePrices:[promo]},{variants:[promo]},{packages:[{corePrices:[promo]}]},{optionGroups:[{options:[promo]}]},{ungroupedOptions:[promo]}]) assert.equal(catalogCardImage(photo,parent),null);
});
test('public CDN resize and cache version parameters are retained',()=>{
 assert.equal(safeCatalogImageUrl('https://cdn.example.com/images/a.webp?width=480&v=2'),'https://cdn.example.com/images/a.webp?width=480&v=2');
});

test('legacy fallback cannot collide with another manufacturer slug',()=>{assert.equal(catalogCardImage({slug:'yarbo-leaf-blower-module'},{slug:'another-brand'})?.src,null);});

test('module-only review never pictures an unpurchased Core or parent',()=>{
 const p=fixture(); p.imageUrl='/test/family.webp'; p.variants.forEach(v=>v.imageUrl='/test/core.webp');
 const option=p.ungroupedOptions.find(o=>o.slug==='yarbo-leaf-blower-module') ?? p.ungroupedOptions[0]; option.accessoryImageUrl='/test/only-option.webp';
 const html=renderToStaticMarkup(<EquipmentSelectionReview selectedProduct={p} buildSelection={{...selection,purchaseMode:'individual-equipment',includeBaseProduct:false,optionQuantities:{[option.id]:1}}}/>);
 assert.doesNotMatch(html,/src="\/test\/(core|family)\.webp"/);
});
test('private authenticated storage locations are not serialized as images',()=>{
 for(const url of ['/storage/v1/object/authenticated/bucket/a.png','https://x.supabase.co/storage/v1/object/authenticated/bucket/a.png']) assert.equal(safeCatalogImageUrl(url),null);
});

test('package slug collision never borrows module photo',()=>{assert.equal(catalogCardImage({slug:'yarbo-leaf-blower-module',name:'Package'}, {slug:'yarbo'})?.src,null);});
