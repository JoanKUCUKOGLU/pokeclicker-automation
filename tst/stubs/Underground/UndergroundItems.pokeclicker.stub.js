// Stub of https://github.com/pokeclicker/pokeclicker/blob/e67493d7fb5bfc75750253ebb44a377898271358/src/modules/underground/UndergroundItems.ts#L11

class UndergroundItems {
  /***************************\
    |*  Pokéclicker interface  *|
    \***************************/

  static list = [];

  static addItem(item) {
    this.list.push(item);
  }

  static getById(id) {
    return this.list.find((item) => item.id === id);
  }

  static getByName(itemName) {
    return this.list.find((item) => item.name === itemName);
  }
}

// ============================================================================
// Diamond Items
// ============================================================================

UndergroundItems.addItem(
  new UndergroundItem(1, "Rare_bone", UndergroundItemValueType.Diamond),
);

UndergroundItems.addItem(
  new UndergroundItem(2, "Star_piece", UndergroundItemValueType.Diamond),
);

UndergroundItems.addItem(
  new UndergroundItem(3, "Revive", UndergroundItemValueType.Diamond),
);

UndergroundItems.addItem(
  new UndergroundItem(4, "Max_revive", UndergroundItemValueType.Diamond),
);

UndergroundItems.addItem(
  new UndergroundItem(5, "Iron_ball", UndergroundItemValueType.Diamond),
);

UndergroundItems.addItem(
  new UndergroundItem(6, "Heart_scale", UndergroundItemValueType.Diamond),
);

UndergroundItems.addItem(
  new UndergroundItem(7, "Light_clay", UndergroundItemValueType.Diamond),
);

UndergroundItems.addItem(
  new UndergroundItem(8, "Odd_keystone", UndergroundItemValueType.Diamond),
);

UndergroundItems.addItem(
  new UndergroundItem(9, "Hard_stone", UndergroundItemValueType.Diamond),
);

UndergroundItems.addItem(
  new UndergroundItem(10, "Oval_stone", UndergroundItemValueType.Diamond),
);

UndergroundItems.addItem(
  new UndergroundItem(11, "Everstone", UndergroundItemValueType.Diamond),
);

UndergroundItems.addItem(
  new UndergroundItem(12, "Smooth_rock", UndergroundItemValueType.Diamond),
);

UndergroundItems.addItem(
  new UndergroundItem(13, "Heat_rock", UndergroundItemValueType.Diamond),
);

UndergroundItems.addItem(
  new UndergroundItem(14, "Icy_rock", UndergroundItemValueType.Diamond),
);

UndergroundItems.addItem(
  new UndergroundItem(15, "Damp_rock", UndergroundItemValueType.Diamond),
);

// ============================================================================
// Gem Plates
// ============================================================================

UndergroundItems.addItem(
  new UndergroundItem(100, "Draco_plate", UndergroundItemValueType.Gem),
);

UndergroundItems.addItem(
  new UndergroundItem(101, "Dread_plate", UndergroundItemValueType.Gem),
);

UndergroundItems.addItem(
  new UndergroundItem(102, "Earth_plate", UndergroundItemValueType.Gem),
);

UndergroundItems.addItem(
  new UndergroundItem(103, "Fist_plate", UndergroundItemValueType.Gem),
);

UndergroundItems.addItem(
  new UndergroundItem(104, "Flame_plate", UndergroundItemValueType.Gem),
);

UndergroundItems.addItem(
  new UndergroundItem(105, "Icicle_plate", UndergroundItemValueType.Gem),
);

UndergroundItems.addItem(
  new UndergroundItem(106, "Insect_plate", UndergroundItemValueType.Gem),
);

UndergroundItems.addItem(
  new UndergroundItem(107, "Iron_plate", UndergroundItemValueType.Gem),
);

UndergroundItems.addItem(
  new UndergroundItem(108, "Meadow_plate", UndergroundItemValueType.Gem),
);

UndergroundItems.addItem(
  new UndergroundItem(109, "Mind_plate", UndergroundItemValueType.Gem),
);

UndergroundItems.addItem(
  new UndergroundItem(110, "Sky_plate", UndergroundItemValueType.Gem),
);

UndergroundItems.addItem(
  new UndergroundItem(111, "Splash_plate", UndergroundItemValueType.Gem),
);

UndergroundItems.addItem(
  new UndergroundItem(112, "Spooky_plate", UndergroundItemValueType.Gem),
);

UndergroundItems.addItem(
  new UndergroundItem(113, "Stone_plate", UndergroundItemValueType.Gem),
);

UndergroundItems.addItem(
  new UndergroundItem(114, "Toxic_plate", UndergroundItemValueType.Gem),
);

UndergroundItems.addItem(
  new UndergroundItem(115, "Zap_plate", UndergroundItemValueType.Gem),
);

UndergroundItems.addItem(
  new UndergroundItem(116, "Pixie_plate", UndergroundItemValueType.Gem),
);

UndergroundItems.addItem(
  new UndergroundItem(117, "Blank_plate", UndergroundItemValueType.Gem),
);

// ============================================================================
// Fossils
// ============================================================================

UndergroundItems.addItem(
  new UndergroundItem(200, "Helix_fossil", UndergroundItemValueType.Fossil),
);

UndergroundItems.addItem(
  new UndergroundItem(201, "Dome_fossil", UndergroundItemValueType.Fossil),
);

UndergroundItems.addItem(
  new UndergroundItem(202, "Old_amber", UndergroundItemValueType.Fossil),
);

UndergroundItems.addItem(
  new UndergroundItem(203, "Root_fossil", UndergroundItemValueType.Fossil),
);

UndergroundItems.addItem(
  new UndergroundItem(204, "Claw_fossil", UndergroundItemValueType.Fossil),
);

UndergroundItems.addItem(
  new UndergroundItem(205, "Armor_fossil", UndergroundItemValueType.Fossil),
);

UndergroundItems.addItem(
  new UndergroundItem(206, "Skull_fossil", UndergroundItemValueType.Fossil),
);

UndergroundItems.addItem(
  new UndergroundItem(207, "Cover_fossil", UndergroundItemValueType.Fossil),
);

UndergroundItems.addItem(
  new UndergroundItem(208, "Plume_fossil", UndergroundItemValueType.Fossil),
);

UndergroundItems.addItem(
  new UndergroundItem(209, "Jaw_fossil", UndergroundItemValueType.Fossil),
);

UndergroundItems.addItem(
  new UndergroundItem(210, "Sail_fossil", UndergroundItemValueType.Fossil),
);

// ============================================================================
// Fossil Pieces
// ============================================================================

UndergroundItems.addItem(
  new UndergroundItem(
    211,
    "Fossilized_bird",
    UndergroundItemValueType.FossilPiece,
  ),
);

UndergroundItems.addItem(
  new UndergroundItem(
    212,
    "Fossilized_fish",
    UndergroundItemValueType.FossilPiece,
  ),
);

UndergroundItems.addItem(
  new UndergroundItem(
    213,
    "Fossilized_drake",
    UndergroundItemValueType.FossilPiece,
  ),
);

UndergroundItems.addItem(
  new UndergroundItem(
    214,
    "Fossilized_dino",
    UndergroundItemValueType.FossilPiece,
  ),
);
