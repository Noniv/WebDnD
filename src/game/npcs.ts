// The people of Emberford and the Emberdeep. Pure data: who they are, what they know,
// what they want, and which game effects a conversation with them may trigger.
// The AI dungeon master voices them from this sheet; without an API key the
// `topics` below give a short scripted conversation instead.
import type { CheckKind } from '../rules/types';
import type { GameState, QuestId } from './state';

/**
 * Things a conversation can make happen. The director applies them (once each, where it
 * matters) and ignores any the NPC isn't allowed, so the AI can never invent rewards.
 */
export type EffectId =
  | 'quest' | 'shop' | 'rest' | 'rest_free' | 'bless' | 'gift_potion' | 'discount'
  | 'reveal_secrets' | 'reveal_trap' | 'warn_wolves'
  // Snikk's den
  | 'ally' | 'peace' | 'toll' | 'flee' | 'fight' | 'release_miner' | 'take_potion';

export type NpcId = 'innkeeper' | 'priest' | 'smith' | 'elder' | 'child' | 'guard' | 'stranger' | 'miner' | 'hermit' | 'snikk';

export interface Topic {
  label: string;
  reply: string;
  effects?: EffectId[];
  /** Scripted check: success gives `reply` + effects, failure gives `fail`. */
  check?: { kind: CheckKind; dc: number; fail: string };
}

export interface NpcDef {
  id: NpcId;
  /** MONSTERS id of their token on the map. */
  monsterId: string;
  name: string;
  title: string;
  portrait: string;
  persona: string;
  voice: string;
  knows: string[];
  /** Only shared after a successful check or real rapport. */
  secrets?: string[];
  wants?: string;
  quest?: QuestId;
  /** When the AI may use each effect. */
  effects: Partial<Record<EffectId, string>>;
  greeting: string;
  topics: Topic[];
}

export const WORLD_LORE = [
  'Emberford is a small, soot-stained mining village. North of it, the Old Mine Road climbs through pine woods to the Emberdeep, a mine that broke into a forgotten crypt.',
  'A month ago something woke in the crypt: the Ash Warden, an ancient guardian in soot-black armour, bound to its post by a brazier of violet fire. Since then miners have gone missing, goblins have moved into the upper mine, and wolves prowl the road.',
  'Deep in the mine is the Shrine of the Last Candle: a candle that burns without wax. The dead cannot cross its light, so it is a safe place to rest.',
  'The Ash Warden heals while its Binding Brazier burns. Dousing or breaking the brazier (with cold, the Ember Phial, Arcana or brute strength) stops that.',
  'The Ember Phial is holy fire in a bottle, kept in a reliquary behind a hidden door in the Hall of Needles.',
  'Below the Emberdeep lie the Drowned Workings: old flooded tunnels where the first miners died. The Lost Lode, a strongbox of ember-ore, is said to be down there.',
];

export const NPCS: Record<NpcId, NpcDef> = {
  elder: {
    id: 'elder', monsterId: 'npc-elder', name: 'Elder Wenna Ashby', title: 'Village elder', portrait: 'elder',
    persona: 'The grey-haired elder of Emberford. Tired, stubborn and kind, carrying the whole village on her back since the miners vanished. She is desperate but proud and will not beg.',
    voice: 'Measured, warm, a little formal. Calls the heroes "travellers" until she trusts them.',
    knows: [
      'Six miners have vanished in a month. The last, Dagan, went up three days ago to find the others and never came back.',
      'The village can pay 100 gold to whoever stops whatever woke in the Emberdeep.',
      'Brother Aldric at the chapel knows the old stories about the Last Candle.',
      'Captain Rusk at the north gate has seen the wolves on the road.',
    ],
    wants: 'Someone to go into the Emberdeep and end the trouble.',
    quest: 'warden',
    effects: {
      quest: 'when the party agrees to go into the Emberdeep and stop the trouble (gives the main quest, "The Warden Wakes")',
      gift_potion: 'if the party earns her trust and asks for help (she gives one Potion of Healing from the village stores)',
    },
    greeting: 'Travellers. Forgive me, we do not get many now. Something in the Emberdeep is killing my miners. Will you hear me out?',
    topics: [
      { label: '"Tell us what happened."', reply: 'A month ago the mine started breathing ash. Then miners stopped coming home. Six of them. Dagan went to look for them three days ago. Nothing since.' },
      { label: '"We will go into the Emberdeep."', reply: 'Then Emberford owes you. One hundred gold, and our thanks, if you end it. Speak to Brother Aldric first; he knows the old stories.', effects: ['quest'] },
      { label: '"Could the village spare a potion?" (Persuasion)', reply: 'It is our last one. Take it, and bring it back inside you, not on the floor of that mine.', effects: ['gift_potion'], check: { kind: 'persuasion', dc: 12, fail: 'I am sorry. We have so little left, and the healers need it here.' } },
    ],
  },
  child: {
    id: 'child', monsterId: 'npc-child', name: 'Pell', title: 'The miner\'s daughter', portrait: 'child',
    persona: 'A ten-year-old girl with a too-big lantern and a brave face. Her father Dagan went into the mine three days ago and has not come back. She has not cried yet and is not going to start in front of strangers.',
    voice: 'Blunt, quick, a child trying to sound grown-up. Short sentences.',
    knows: [
      'Her father Dagan went up to the mine to find the missing miners.',
      'Dagan always carried his lucky pick with a red ribbon on it.',
      'She heard goblins took prisoners: a peddler told the innkeeper he saw goblins dragging a man in a cage.',
    ],
    wants: 'Her father home, alive.',
    quest: 'miner',
    effects: {
      quest: 'when the party promises to look for her father Dagan (gives the quest "Pell\'s Father")',
    },
    greeting: 'Are you going up to the mine? My da\'s up there. Dagan. He has a pick with a red ribbon. Will you find him?',
    topics: [
      { label: '"We\'ll find your father."', reply: 'Promise? A peddler said goblins had a man in a cage. If it\'s him... please hurry.', effects: ['quest'] },
      { label: '"What do you know about the mine?"', reply: 'Da says the old tunnels go deeper than anyone mapped. He knows secret ways nobody else does.' },
    ],
  },
  miner: {
    id: 'miner', monsterId: 'npc-miner', name: 'Dagan', title: 'Captured miner', portrait: 'miner',
    persona: 'A big, gentle miner with a bruised face. Caught by goblins while searching for his missing friends. Grateful, frightened for his daughter Pell, and a walking map of the old tunnels.',
    voice: 'Slow, plain, a working man\'s words. Says "aye".',
    knows: [
      'The other missing miners went down the old shaft into the Drowned Workings. He fears they are dead, and walking.',
      'The Hall of Needles past the goblin den has pressure plates that fire poison needles. Step around them, or time the reload.',
      'There is a hidden door in the east wall of the Hall of Needles, and another passage into the crypt behind the shrine. Miners used them.',
      'The Lost Lode, the foreman\'s strongbox of ember-ore, is in the vault at the far end of the Drowned Workings.',
    ],
    wants: 'To get home to Pell.',
    effects: {
      reveal_trap: 'when he tells the party about the needle trap in the Hall of Needles',
      reveal_secrets: 'when he tells the party where the hidden doors are',
    },
    greeting: 'You... you\'re not goblins. Thank the Candle. Is Pell all right? My girl, in Emberford?',
    topics: [
      { label: '"Pell is safe. She sent us."', reply: 'Then I\'ll get home if I have to crawl. Listen: the hall past this den has needle plates on the floor. And there are two hidden doors, the old miners\' ways. East wall of the hall, and one into the crypt.', effects: ['reveal_trap', 'reveal_secrets'] },
      { label: '"What happened to the other miners?"', reply: 'They went down the old shaft into the Drowned Workings. I heard them... after. Walking in the water. They\'re not themselves any more.' },
    ],
  },
  innkeeper: {
    id: 'innkeeper', monsterId: 'npc-innkeeper', name: 'Marta Holloway', title: 'Keeper of the Last Ember inn', portrait: 'innkeeper',
    persona: 'Runs the Last Ember inn. Broad, loud, sharp-eyed, hears every rumour. Grumbles about business but feeds anyone who looks hungry. Fond of Pell and worried for Dagan.',
    voice: 'Brisk, teasing, calls people "love" and "you lot".',
    knows: [
      'A bed and a hot meal cost 5 gold; a night\'s sleep restores the party fully.',
      'A peddler swore he saw goblins dragging a miner in a cage up the mine road.',
      'Old Moss the hermit lives on the mine road and knows every herb and every wolf in those woods.',
      'Ysolde, the hooded stranger by the trees, arrived a week ago and asks too many questions about the crypt.',
    ],
    effects: {
      rest: 'when the party wants to rest at the inn (costs 5 gold)',
      rest_free: 'if the party charms her or has helped the village (a free night)',
    },
    greeting: 'Well, you lot look like you\'ve walked a long way. Room\'s 5 gold, stew\'s included. What\'ll it be?',
    topics: [
      { label: '"A room for the night." (5 gold)', reply: 'Up the stairs, second door. Boots off the beds.', effects: ['rest'] },
      { label: '"Heard any rumours?"', reply: 'A peddler swears goblins dragged a miner up the mine road in a cage. And that hooded woman by the trees asks a lot about the old crypt. Make of that what you will.' },
      { label: '"Surely heroes stay free?" (Persuasion)', reply: 'Oh, go on then. Heroes eat free tonight. Don\'t tell anyone.', effects: ['rest_free'], check: { kind: 'persuasion', dc: 14, fail: 'Heroes pay like everyone else, love. Five gold.' } },
    ],
  },
  priest: {
    id: 'priest', monsterId: 'npc-priest', name: 'Brother Aldric', title: 'Priest of the Last Candle', portrait: 'priest',
    persona: 'An old, gentle priest who tends the village chapel. Knows the legends of the Last Candle and the Ash Warden. Grieves for the drowned miners, who were his flock.',
    voice: 'Soft, patient, a storyteller. Fond of candle and light metaphors.',
    knows: [
      'The Ash Warden was once a holy guardian set to protect the Last Candle\'s crypt. Something corrupted it, and a brazier of violet fire binds it now.',
      'While the brazier burns, the Warden heals. Douse it with cold or holy fire, or break it, and the Warden weakens.',
      'The Ember Phial, holy fire in a bottle, was hidden in a reliquary behind a hidden door in the Hall of Needles.',
      'The Last Candle\'s shrine is safe: the dead cannot cross its light.',
      'The miners who drowned in the old workings may not rest easy. He wants them laid to rest.',
    ],
    quest: 'drowned',
    effects: {
      quest: 'when the party agrees to lay the drowned miners in the Drowned Workings to rest (gives the quest "Rest for the Drowned")',
      bless: 'when he blesses the party before they go (everyone is Blessed at the start of their next fight). Free for those who help, otherwise for a kind word or a donation.',
    },
    greeting: 'Welcome, children, to the Candle\'s house. You have the look of people walking towards trouble. May I offer a blessing, or a story?',
    topics: [
      { label: '"Tell us about the Ash Warden."', reply: 'It was a guardian once, sworn to the Last Candle. Now violet fire binds it, and while that brazier burns, its wounds close. Douse the brazier, with cold or holy fire, and it can be beaten. The Ember Phial lies hidden in the Hall of Needles.' },
      { label: '"Bless us before we go."', reply: 'Kneel, then. May the Candle light your first steps into the dark.', effects: ['bless'] },
      { label: '"Is there anything we can do for you?"', reply: 'The first miners drowned in the old workings below the mine. I fear they walk still. If you can, lay them to rest.', effects: ['quest'] },
    ],
  },
  smith: {
    id: 'smith', monsterId: 'npc-smith', name: 'Old Torvin', title: 'Smith and trader', portrait: 'smith',
    persona: 'A white-bearded dwarf smith who sells supplies from his forge. Gruff, honest, a haggler who respects a good haggle. Dreams of working real ember-ore again.',
    voice: 'Gravelly, terse, dwarvish oaths ("by stone and hammer").',
    knows: [
      'He sells Potions of Healing for 50 gold each (35 for friends).',
      'The Lost Lode, a strongbox of ember-ore, is somewhere in the flooded workings below the mine. He would pay well for the ore.',
      'Goblins hate fire and fear anything bigger than they are.',
    ],
    quest: 'lode',
    effects: {
      shop: 'when the party wants to buy something (opens his shop)',
      discount: 'if the party haggles well or does him a favour (potions drop to 35 gold)',
      quest: 'when the party agrees to look for the Lost Lode\'s ember-ore (gives the quest "The Lost Lode")',
    },
    greeting: 'Hmph. Customers, or more sightseers? I\'ve potions, if you\'ve gold.',
    topics: [
      { label: '"Show us your wares."', reply: 'Potions of Healing. Fifty gold. They work, which is more than I can say for most.', effects: ['shop'] },
      { label: '"Fifty is robbery." (Persuasion)', reply: 'Ha! Fine, thirty-five. You haggle like a dwarf.', effects: ['discount'], check: { kind: 'persuasion', dc: 13, fail: 'Fifty. Stone doesn\'t bargain, and neither do I.' } },
      { label: '"Any work for us?"', reply: 'The Lost Lode. Strongbox of ember-ore, down in the flooded workings. Bring me the ore and I\'ll pay sixty gold, and throw in a potion.', effects: ['quest'] },
    ],
  },
  guard: {
    id: 'guard', monsterId: 'npc-guard', name: 'Captain Rusk', title: 'Captain of the village watch', portrait: 'guard',
    persona: 'The captain of Emberford\'s tiny watch: one tired, scarred veteran with a spear. Blunt, protective, embarrassed that he cannot leave the gate to help.',
    voice: 'Clipped soldier-speak. Calls people by their class ("wizard", "sword-arm").',
    knows: [
      'A wolf pack has taken the clearing halfway up the mine road. Four of them, hungry and bold.',
      'Wolves hunt as a pack: never let one get you alone, and they come at you from both sides.',
      'Old Moss the hermit lives just below the clearing and might help.',
    ],
    effects: {
      warn_wolves: 'when he warns the party exactly where the wolves wait, so they will not be caught off guard',
    },
    greeting: 'Hold. You heading up the mine road? Then listen first, or the wolves will have you.',
    topics: [
      { label: '"Tell us about the wolves."', reply: 'Four of them, in the clearing halfway up. They wait downwind and rush you from both sides. Go in knowing they\'re there and you\'ll catch them napping instead.', effects: ['warn_wolves'] },
      { label: '"Why don\'t you come with us?"', reply: 'Because then nobody guards this gate. Bring Dagan home and I\'ll buy you a drink.' },
    ],
  },
  stranger: {
    id: 'stranger', monsterId: 'npc-stranger', name: 'Ysolde', title: 'Hooded stranger', portrait: 'stranger',
    persona: 'A hooded scholar from the city who arrived a week ago. Secretly a descendant of the knight who became the Ash Warden; she wants it freed from the brazier and put to rest, not just smashed. Guarded and clever, she tests people before she trusts them.',
    voice: 'Quiet, precise, answers questions with questions.',
    knows: [
      'She studies old crypts and the knights who guarded them.',
      'The Ash Warden was a knight named Ser Caddoc, sworn to the Last Candle.',
    ],
    secrets: [
      'She is Ser Caddoc\'s descendant and wants his spirit freed: destroying the brazier frees him.',
      'There are two hidden doors in the Emberdeep: one in the east wall of the Hall of Needles, one from a crawlway into the crypt itself.',
    ],
    effects: {
      reveal_secrets: 'only if the party earns her trust (a good Insight or Persuasion check, or honesty about their purpose): she tells them where the two hidden doors are',
    },
    greeting: 'You are going into the Emberdeep. Do you know what waits at the bottom, or are you only going for the gold?',
    topics: [
      { label: '"Who are you, really?" (Insight)', reply: 'Perceptive. Ser Caddoc, the Ash Warden, was my ancestor. Break his brazier and you free him. Take this: there are two hidden doors, in the hall of needles and into the crypt itself.', effects: ['reveal_secrets'], check: { kind: 'insight', dc: 13, fail: 'A scholar. Nothing more. Good luck in the dark.' } },
      { label: '"What do you know about the Warden?"', reply: 'His name was Ser Caddoc. He was a good man, once. Remember that when you face him.' },
    ],
  },
  hermit: {
    id: 'hermit', monsterId: 'npc-hermit', name: 'Old Moss', title: 'Hermit of the mine road', portrait: 'hermit',
    persona: 'An ancient herbalist who lives in a mossy hut on the mine road. Talks to plants, knows every animal in the wood, and is very cross that wolves have taken his favourite clearing. Kind under the grumbling.',
    voice: 'Rambling, earthy, mixes up names, laughs at his own jokes.',
    knows: [
      'Four wolves hold the clearing just north of his hut. Hungry, desperate, bold.',
      'He makes healing draughts from moss and honey.',
      'The mine has breathed ash for a month. The birds left first.',
    ],
    quest: 'wolves',
    effects: {
      warn_wolves: 'when he tells the party where the wolves wait, so they will not be caught off guard',
      quest: 'when the party agrees to deal with the wolves (gives the quest "Wolves on the Road")',
      gift_potion: 'if the party is kind to him or helps him (one healing draught, a Potion of Healing)',
    },
    greeting: 'Eh? Visitors! Mind the mushrooms. You\'re not wolves, are you? No, too many legs. Too few. Hm.',
    topics: [
      { label: '"Is the road safe?"', reply: 'Safe? Ha! Four wolves in my clearing, just north. Go in quiet and you\'ll catch them sleeping. Drive them off and I\'ll owe you.', effects: ['warn_wolves', 'quest'] },
      { label: '"Could you spare a remedy?" (Persuasion)', reply: 'For polite folk? Here. Moss and honey. Don\'t drink it all at once. Or do.', effects: ['gift_potion'], check: { kind: 'persuasion', dc: 11, fail: 'Remedies are for friends. We\'ve only just met!' } },
    ],
  },
  snikk: {
    id: 'snikk', monsterId: 'goblin-boss', name: 'Snikk, Goblin Boss', title: 'Boss of the den', portrait: 'goblin_boss',
    persona: 'The cunning, greedy boss of a small goblin gang squatting in the upper Emberdeep. Loud and threatening but secretly terrified of the Ash Warden below, which ate two of his goblins. Respects strength and loves loot. Holds a captured miner, Dagan, in a cage as a bargaining chip.',
    voice: 'Talks about himself in the third person ("Snikk wants..."), wheedling, sudden shouting, goblin bravado.',
    knows: [
      'This is Snikk\'s den, Snikk\'s fire and Snikk\'s toll: travellers pay or bleed.',
      'Something big and burning lives past the hall of needles. It ate two of his goblins.',
      'He has the black iron key to the crypt door.',
      'The hall past the den has needle plates on the floor.',
    ],
    secrets: [
      'He would happily let someone else kill the burning thing, and would hand over the crypt key and point out the hidden doors to anyone who promises to do it.',
      'The caged miner is worth something to someone: he will trade him for a potion, a good bargain or a good scare.',
    ],
    wants: 'Loot, safety, and the burning thing gone.',
    effects: {
      ally: 'the ONLY way he hands over the crypt key: when the party convinces him they will kill the burning thing below. He gives the key and points out the hidden doors. Ends the talk.',
      peace: 'when the party talks their way past without paying. No key. Ends the talk.',
      toll: 'when the party pays a toll or makes a fair bargain just to pass. He warns them of the needle plates but keeps the key (if you want him to give the key, use "ally" instead). Ends the talk.',
      take_potion: 'when the party hands over a Potion of Healing as payment',
      flee: 'when the party truly terrifies him (a strong Intimidation result): the goblins run. Ends the talk.',
      fight: 'when talks break down, the party attacks or insults him past bearing. Ends the talk.',
      release_miner: 'when he agrees to let the caged miner Dagan go (together with a deal)',
    },
    greeting: 'Oi! Tall-folk on Snikk\'s stair! Snikk\'s fire, Snikk\'s stair, Snikk\'s toll. Pay, or bleed!',
    topics: [],
  },
};

/** NPC sheet for a map creature (by its monster id). */
export function npcForMonster(monsterId: string | undefined): NpcDef | null {
  if (!monsterId) return null;
  return Object.values(NPCS).find((n) => n.monsterId === monsterId) ?? null;
}

export const QUESTS: Record<QuestId, { name: string; giver: NpcId; goal: string; reward: string }> = {
  warden: { name: 'The Warden Wakes', giver: 'elder', goal: 'Stop whatever woke in the Emberdeep, then report to Elder Wenna.', reward: '100 gold' },
  miner: { name: 'Pell\'s Father', giver: 'child', goal: 'Find Dagan the miner and bring him home to Pell.', reward: 'Dagan\'s savings and the village\'s thanks' },
  wolves: { name: 'Wolves on the Road', giver: 'hermit', goal: 'Deal with the wolves in the clearing on the Old Mine Road, then tell Old Moss.', reward: 'Healing draughts' },
  drowned: { name: 'Rest for the Drowned', giver: 'priest', goal: 'Lay the drowned miners in the Drowned Workings to rest, then tell Brother Aldric.', reward: 'The Candle\'s blessing and 40 gold' },
  lode: { name: 'The Lost Lode', giver: 'smith', goal: 'Bring the ember-ore from the Lost Lode in the Drowned Workings to Old Torvin.', reward: '60 gold and a potion' },
};

export interface QuestLine { id: QuestId; name: string; goal: string; reward: string; giver: string; status: 'active' | 'ready' | 'done' }

/** Quests the party knows about, with "ready" meaning: the job is done, go and tell the giver. */
export function questLog(s: GameState): QuestLine[] {
  const done = (q: QuestId): boolean => {
    switch (q) {
      case 'warden': return s.bossDone;
      case 'miner': return !!s.flags.minerFreed;
      case 'wolves': return !!s.flags['cleared:wolves'];
      case 'drowned': return !!s.flags['cleared:drowned'];
      case 'lode': return (s.inv.items ?? []).includes('ore');
    }
  };
  return (Object.keys(QUESTS) as QuestId[])
    .filter((q) => s.quests[q] || done(q))
    .map((q) => ({
      id: q, ...QUESTS[q], giver: NPCS[QUESTS[q].giver].name,
      status: s.quests[q] === 'done' ? 'done' : done(q) ? 'ready' : 'active',
    }));
}

/** One line for menus: "2 active, 1 to report". */
export function questSummary(s: GameState): string {
  const q = questLog(s);
  if (!q.length) return 'None yet: talk to the villagers';
  const act = q.filter((x) => x.status === 'active').length;
  const ready = q.filter((x) => x.status === 'ready').length;
  const done = q.filter((x) => x.status === 'done').length;
  return [act ? `${act} active` : '', ready ? `${ready} to report` : '', done ? `${done} done` : ''].filter(Boolean).join(' · ');
}
