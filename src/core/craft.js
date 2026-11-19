/** Crafting: three scavenged materials turn into supplies. Used by the workbench panel (ui/menu.js). */
export const MATS = [
  { key: 'scrap', name: 'SCRAP', cap: 12 },
  { key: 'cloth', name: 'CLOTH', cap: 8 },
  { key: 'wood', name: 'WOOD', cap: 12 }
];

export const RECIPES = [
  { id: 'kit', name: 'BARRICADE KIT', desc: 'Seals one entrance', cost: { wood: 2, scrap: 1 }, out: 'kits', n: 1, cap: 6 },
  { id: 'medkit', name: 'MEDKIT', desc: '+45 health', cost: { cloth: 2, scrap: 1 }, out: 'medkit', n: 1, cap: 5 },
  { id: 'ammo', name: 'PISTOL ROUNDS x8', desc: 'Ammo for the pistol', cost: { scrap: 2 }, out: 'ammo', n: 8, cap: 60 },
  { id: 'shells', name: 'SHOTGUN SHELLS x3', desc: 'Shells for the shotgun', cost: { scrap: 2, cloth: 1 }, out: 'shells', n: 3, cap: 24 }
];

export function costText(r) {
  return Object.entries(r.cost).map(([k, n]) => `${n} ${k.toUpperCase()}`).join(' + ');
}

/** null when the recipe can be crafted, otherwise the reason it cannot. */
export function whyNot(inv, r) {
  for (const [k, n] of Object.entries(r.cost)) if ((inv[k] || 0) < n) return 'NEED ' + k.toUpperCase();
  if ((inv[r.out] || 0) >= r.cap) return 'FULL';
  return null;
}

export function craft(inv, id) {
  const r = RECIPES.find((x) => x.id === id);
  if (!r || whyNot(inv, r)) return false;
  for (const [k, n] of Object.entries(r.cost)) inv[k] -= n;
  inv[r.out] = Math.min(r.cap, (inv[r.out] || 0) + r.n);
  return true;
}
