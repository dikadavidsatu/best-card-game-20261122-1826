// The card catalogue: 48 original cards, twelve for each of the four houses.
// Every card is data only — name, house, cost, power, effect kind and a line of
// flavour — so new cards are added by adding one object here, and the deck
// builder below is the only code that ever reads the list.
//
// Balance sketch: cost 0 cards are small and free, cost 1 is the workhorse,
// cost 2 hits hard or heals big, cost 3 is a swing card. Power is the number
// the effect kind spends: damage, shield, healing, or cards drawn.

import { HOUSE_ORDER } from './config.js';
import { shuffle } from './random.js';

// --- Ember: the house of fire. Cheap aggression, kindle chains, burn. -----
const EMBER_CARDS = [
  { id: 'ember-spark', name: 'Spark Imp', house: 'ember', cost: 0, power: 2, kind: 'strike', text: 'Deal 2 damage.', flavor: 'It bites first and introduces itself later.' },
  { id: 'ember-cinder', name: 'Cinder Toss', house: 'ember', cost: 1, power: 3, kind: 'strike', text: 'Deal 3 damage.', flavor: 'A handful of the hearth, thrown with feeling.' },
  { id: 'ember-kindling', name: 'Kindling', house: 'ember', cost: 1, power: 2, kind: 'kindle', text: 'Deal 2 damage, +1 per Ember played.', flavor: 'One coal is a spark. A pile is a bonfire.' },
  { id: 'ember-flare', name: 'Hearth Flare', house: 'ember', cost: 1, power: 4, kind: 'strike', text: 'Deal 4 damage.', flavor: 'The fire remembers every slight.' },
  { id: 'ember-brand', name: 'Brand the Gate', house: 'ember', cost: 2, power: 5, kind: 'strike', text: 'Deal 5 damage.', flavor: 'The gate still bears the mark. So does the Regent.' },
  { id: 'ember-ashen', name: 'Ashen Tithe', house: 'ember', cost: 2, power: 4, kind: 'drain', text: 'Deal 4 damage. Heal half of it.', flavor: 'The Court always takes its cut — in ash.' },
  { id: 'ember-wildfire', name: 'Wildfire', house: 'ember', cost: 2, power: 3, kind: 'rally', text: 'Deal 3 damage, +3 with Favor.', flavor: 'It started as a candle. Nobody admits lighting it.' },
  { id: 'ember-phoenix', name: 'Phoenix Vow', house: 'ember', cost: 2, power: 5, kind: 'mend', text: 'Restore 5 life.', flavor: 'Burn down, rise up, bill the Regent.' },
  { id: 'ember-emberguard', name: 'Emberguard', house: 'ember', cost: 1, power: 4, kind: 'guard', text: 'Gain 4 shield.', flavor: 'A wall of coals. Touch it and learn.' },
  { id: 'ember-scorch', name: 'Scorching Edict', house: 'ember', cost: 3, power: 7, kind: 'strike', text: 'Deal 7 damage.', flavor: 'Signed, sealed, delivered in smoke.' },
  { id: 'ember-inferno', name: 'Inferno Court', house: 'ember', cost: 3, power: 6, kind: 'pierce', text: 'Deal 6 damage, ignoring shield.', flavor: 'No wall in the Court has ever stopped it.' },
  { id: 'ember-emberling', name: 'Emberling Scout', house: 'ember', cost: 0, power: 1, kind: 'draw', text: 'Deal 2 damage. Draw 1 card.', flavor: 'Small, fast, and terribly well informed.' },
];

// --- Tide: the house of water. Control, draw, and patient damage. --------
const TIDE_CARDS = [
  { id: 'tide-droplet', name: 'Droplet', house: 'tide', cost: 0, power: 1, kind: 'strike', text: 'Deal 1 damage.', flavor: 'Every flood begins with one drop.' },
  { id: 'tide-current', name: 'Swift Current', house: 'tide', cost: 1, power: 3, kind: 'strike', text: 'Deal 3 damage.', flavor: 'You never see the river coming. Only going.' },
  { id: 'tide-under', name: 'Undertow', house: 'tide', cost: 1, power: 2, kind: 'draw', text: 'Deal 2 damage. Draw 2 cards.', flavor: 'It pulls you under and hands you a map.' },
  { id: 'tide-breaker', name: 'Breaker', house: 'tide', cost: 1, power: 4, kind: 'strike', text: 'Deal 4 damage.', flavor: 'The wave does not negotiate.' },
  { id: 'tide-mist', name: 'Harbor Mist', house: 'tide', cost: 1, power: 5, kind: 'guard', text: 'Gain 5 shield.', flavor: 'You cannot hit what you cannot see.' },
  { id: 'tide-depths', name: 'Call the Depths', house: 'tide', cost: 2, power: 5, kind: 'strike', text: 'Deal 5 damage.', flavor: 'Something old answers. It is not friendly.' },
  { id: 'tide-siren', name: 'Siren’s Bargain', house: 'tide', cost: 2, power: 4, kind: 'drain', text: 'Deal 4 damage. Heal half of it.', flavor: 'A lovely song. Read the fine print.' },
  { id: 'tide-ebb', name: 'Ebb and Mend', house: 'tide', cost: 2, power: 6, kind: 'mend', text: 'Restore 6 life.', flavor: 'The tide takes, the tide returns.' },
  { id: 'tide-maelstrom', name: 'Maelstrom', house: 'tide', cost: 2, power: 4, kind: 'rally', text: 'Deal 4 damage, +3 with Favor.', flavor: 'Round and round, faster and faster.' },
  { id: 'tide-torrent', name: 'Torrent', house: 'tide', cost: 3, power: 7, kind: 'strike', text: 'Deal 7 damage.', flavor: 'The dam held for a hundred years. Today it did not.' },
  { id: 'tide-abyss', name: 'Abyssal Verdict', house: 'tide', cost: 3, power: 6, kind: 'pierce', text: 'Deal 6 damage, ignoring shield.', flavor: 'The deep court finds you guilty. No appeal.' },
  { id: 'tide-tidecaller', name: 'Tidecaller', house: 'tide', cost: 0, power: 1, kind: 'draw', text: 'Deal 2 damage. Draw 1 card.', flavor: 'She asks the sea. The sea usually agrees.' },
];

// --- Thorn: the house of growth. Shields, healing, and steady pressure. ---
const THORN_CARDS = [
  { id: 'thorn-seed', name: 'Thorn Seed', house: 'thorn', cost: 0, power: 2, kind: 'guard', text: 'Gain 2 shield.', flavor: 'Plant it. Water it. Hide behind it.' },
  { id: 'thorn-briar', name: 'Briar Lash', house: 'thorn', cost: 1, power: 3, kind: 'strike', text: 'Deal 3 damage.', flavor: 'The garden fights back now.' },
  { id: 'thorn-vine', name: 'Stranglevine', house: 'thorn', cost: 1, power: 3, kind: 'guard', text: 'Gain 3 shield.', flavor: 'It holds the door so you do not have to.' },
  { id: 'thorn-bloom', name: 'Bloodbloom', house: 'thorn', cost: 1, power: 3, kind: 'drain', text: 'Deal 3 damage. Heal half of it.', flavor: 'Beautiful. Thorny. Thirsty.' },
  { id: 'thorn-root', name: 'Deep Root', house: 'thorn', cost: 1, power: 5, kind: 'mend', text: 'Restore 5 life.', flavor: 'Roots do not hurry, and they do not lose.' },
  { id: 'thorn-thicket', name: 'Living Thicket', house: 'thorn', cost: 2, power: 7, kind: 'guard', text: 'Gain 7 shield.', flavor: 'A hedge with opinions and excellent timing.' },
  { id: 'thorn-nettle', name: 'Nettle Storm', house: 'thorn', cost: 2, power: 5, kind: 'strike', text: 'Deal 5 damage.', flavor: 'A thousand tiny stings, all at once.' },
  { id: 'thorn-spore', name: 'Spore Cloud', house: 'thorn', cost: 2, power: 2, kind: 'draw', text: 'Deal 2 damage. Draw 2 cards.', flavor: 'Breathe deep. Think fast. Sneeze later.' },
  { id: 'thorn-overgrowth', name: 'Overgrowth', house: 'thorn', cost: 2, power: 4, kind: 'rally', text: 'Deal 4 damage, +3 with Favor.', flavor: 'The Court planted one seed. It planted back.' },
  { id: 'thorn-ancient', name: 'Ancient Oak Oath', house: 'thorn', cost: 3, power: 8, kind: 'mend', text: 'Restore 8 life.', flavor: 'The oldest tree in the Court keeps its promises.' },
  { id: 'thorn-impale', name: 'Impaling Grove', house: 'thorn', cost: 3, power: 7, kind: 'pierce', text: 'Deal 7 damage, ignoring shield.', flavor: 'The forest has no doors. Only spikes.' },
  { id: 'thorn-sapling', name: 'Sapling Scout', house: 'thorn', cost: 0, power: 1, kind: 'draw', text: 'Deal 2 damage. Draw 1 card.', flavor: 'It will be a great tree one day. Today it reports.' },
];

// --- Gild: the house of gold. Expensive, precise, and ruthless. ------------
const GILD_CARDS = [
  { id: 'gild-coin', name: 'Copper Coin', house: 'gild', cost: 0, power: 2, kind: 'strike', text: 'Deal 2 damage.', flavor: 'Small change, spent with great confidence.' },
  { id: 'gild-ledger', name: 'Ledger Strike', house: 'gild', cost: 1, power: 3, kind: 'strike', text: 'Deal 3 damage.', flavor: 'Every debt is collected. Eventually.' },
  { id: 'gild-tithe', name: 'Golden Tithe', house: 'gild', cost: 1, power: 3, kind: 'drain', text: 'Deal 3 damage. Heal half of it.', flavor: 'The Court takes ten percent. Of everything.' },
  { id: 'gild-vault', name: 'Vault Door', house: 'gild', cost: 1, power: 6, kind: 'guard', text: 'Gain 6 shield.', flavor: 'Three feet of steel, one very smug lock.' },
  { id: 'gild-merchant', name: 'Merchant Prince', house: 'gild', cost: 1, power: 2, kind: 'draw', text: 'Deal 2 damage. Draw 2 cards.', flavor: 'He sells you the rope, then the rescue.' },
  { id: 'gild-gavel', name: 'Gilded Gavel', house: 'gild', cost: 2, power: 5, kind: 'strike', text: 'Deal 5 damage.', flavor: 'Order in the Court. Order, and then pain.' },
  { id: 'gild-aegis', name: 'Aegis of Coin', house: 'gild', cost: 2, power: 6, kind: 'mend', text: 'Restore 6 life.', flavor: 'Gold-plated, blessed, and fully insured.' },
  { id: 'gild-crown', name: 'Crown’s Rally', house: 'gild', cost: 2, power: 4, kind: 'rally', text: 'Deal 4 damage, +3 with Favor.', flavor: 'The crown calls. The Court answers.' },
  { id: 'gild-auction', name: 'Auction Hammer', house: 'gild', cost: 2, power: 2, kind: 'draw', text: 'Deal 2 damage. Draw 2 cards.', flavor: 'Going once. Going twice. Sold — to your face.' },
  { id: 'gild-treasury', name: 'Treasury Vault', house: 'gild', cost: 3, power: 8, kind: 'guard', text: 'Gain 8 shield.', flavor: 'Behind this door: the entire budget. And a guard.' },
  { id: 'gild-verdict', name: 'Golden Verdict', house: 'gild', cost: 3, power: 8, kind: 'strike', text: 'Deal 8 damage.', flavor: 'The jury was bribed. The verdict was not.' },
  { id: 'gild-exchequer', name: 'Exchequer’s Due', house: 'gild', cost: 3, power: 7, kind: 'pierce', text: 'Deal 7 damage, ignoring shield.', flavor: 'Taxes, death, and this card. In that order.' },
];

/** Every card in the game, grouped by house in the catalogue order. */
export const ALL_CARDS = [...EMBER_CARDS, ...TIDE_CARDS, ...THORN_CARDS, ...GILD_CARDS];

/** Look a card up by id; undefined when no card carries it. */
export function cardById(id) {
  return ALL_CARDS.find((card) => card.id === id);
}

/**
 * Build a fresh 30-card deck for one side: two copies of a shuffled pick of
 * fifteen cards from the catalogue, so every duel draws a different mix and
 * no two decks are alike. The Regent's later duels swap in more swing cards.
 */
export function buildDeck(random, duelIndex) {
  const pool = shuffle(random, [...ALL_CARDS]);
  const picked = pool.slice(0, 15);
  if (duelIndex >= 2) {
    // The final Regent plays a greedier deck: swap two cheap cards for swings.
    const swings = ALL_CARDS.filter((c) => c.cost === 3);
    picked[13] = swings[duelIndex % swings.length];
    picked[14] = swings[(duelIndex + 3) % swings.length];
  }
  const deck = [...picked, ...picked];
  return shuffle(random, deck);
}

/** The four houses in catalogue order, for legends and the title screen. */
export function houseList() {
  return HOUSE_ORDER;
}
