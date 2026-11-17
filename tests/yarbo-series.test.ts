import assert from "node:assert/strict";
import test from "node:test";
import { yarboSeriesForProduct } from "../lib/catalog/yarbo-series";
test("current canonical, PAC-MAN and refurbished systems stay in Y Series", () => {
  for (const slug of ["yarbo", "yarbo-pac-man-snow-blower-gen-2", "yarbo-pac-man-snow-blower-gen-2-mower-pro", "yarbo-refurbished-core", "yarbo-refurbished-y40-snow-blower-lawn-mower", "yarbo-refurbished-y40-snow-blower", "yarbo-refurbished-y40-lawn-mower"]) assert.equal(yarboSeriesForProduct({slug, name: "Equipment"}), "Y Series");
});
test("future explicit series and model markers classify without mistaking Mower or Core for series", () => {
  for (const series of ["M", "C", "Y"]) {
    assert.equal(yarboSeriesForProduct({slug: "future", name: `Yarbo ${series} Series System`}), `${series} Series`);
    assert.equal(yarboSeriesForProduct({slug: "future", name: `Yarbo ${series}20 Robot`}), `${series} Series`);
  }
  for (const name of ["Yarbo Lawn Mower", "Yarbo Core", "Future Yarbo Product"]) assert.equal(yarboSeriesForProduct({slug: "future", name}), "Other Yarbo Equipment");
});
