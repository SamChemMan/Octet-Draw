// The library's Lab equipment set: instruments, plasticware and tools, in the Lab group's line style (art.mjs path
// data, 40 units to a bond length, y down). Every drawing here is Octet's own.
import { art, circle, ellipse, fill, fine, ink, rect, seg, solid } from "./art.mjs";

const PER = { per: 40 };

// Microscope: a foot, a curved arm, the stage, the objectives and an eyepiece tube leaning back.
function microscope() {
  return art("Microscope", "light microscope, compound microscope, microscopy", PER, [
    ink(rect(-40, 52, 80, 12, 4)),
    ink(`M18 52L18 30C30 22 34 4 26 -14L20 -26`), ink(`M8 52L8 34C18 26 22 8 16 -10L12 -20`),
    ink(rect(-30, 22, 50, 6, 2)), fine(ink(seg(-18, 22, -4, 22))),
    ink(`M2 -30L-14 -6L-18 4L-10 8L-4 0L10 -22Z`), ink(`M-18 4L-20 12M-10 8L-12 14`),
    ink(`M6 -30L-10 -60L-2 -64L16 -34`), ink(`M-14 -66L-4 -72L2 -62L-8 -56Z`),
    ink(circle(26, 6, 5)), ink(circle(22, 40, 3)),
  ]);
}
// Micropipette: a plunger, a body with its grip and volume window, and a tip.
function micropipette() {
  return art("Micropipette", "pipette, Gilson, pipettor, volume", PER, [
    ink(rect(-5, -82, 10, 6, 2)), ink(`M-2 -76L-2 -66M2 -76L2 -66`),
    ink(`M-9 -66L9 -66L9 -4Q9 4 4 8L4 28L-4 28L-4 8Q-9 4 -9 -4Z`), ink(`M9 -50L18 -44L18 -36L9 -36`),
    fine(ink(rect(-5, -40, 10, 14, 2))), fine(ink(seg(-3, -35, 3, -35))), fine(ink(seg(-3, -31, 3, -31))),
    ink(`M-4 28L4 28L1 78L-1 78Z`),
  ]);
}
// Microcentrifuge (Eppendorf) tube: a conical tube with its lid open on a hinge.
function microtube() {
  return art("Microcentrifuge tube", "Eppendorf tube, microtube, sample tube", PER, [
    fill(`M-10 4L10 4L9 12L2 38Q0 41 -2 38L-9 12Z`), ink(`M-12 -26L12 -26M-10 -26L-10 4L-9 12L-2 38Q0 41 2 38L9 12L10 4L10 -26`),
    ink(`M12 -24L18 -22Q22 -20 22 -16L22 -12`), ink(rect(14, -12, 18, 6, 2)), ink(`M18 -6L18 0L28 0L28 -6`),
  ]);
}
// Centrifuge tube: a long tube with a screw cap and a conical end.
function centrifugeTube() {
  return art("Centrifuge tube", "Falcon tube, conical tube, 50 mL", PER, [
    fill(`M-12 0L12 0L12 40L2 62Q0 64 -2 62L-12 40Z`), ink(rect(-15, -64, 30, 14, 3)), fine(ink(`M-10 -64L-10 -50M-5 -64L-5 -50M0 -64L0 -50M5 -64L5 -50M10 -64L10 -50`)),
    ink(`M-12 -50L-12 40L-2 62Q0 64 2 62L12 40L12 -50`), ...[-30, -18, -6, 6, 18].map((y) => fine(ink(seg(-12, y, -6, y)))),
  ]);
}
// Petri dish: a shallow dish and its lid, seen a little from above, with colonies.
function petriDish() {
  return art("Petri dish", "agar plate, culture, colonies", PER, [
        ink(ellipse(0, 0, 40, 12)), ink(`M-40 0L-40 8A40 12 0 0 0 40 8L40 0`),
    ...[[-14, -2, 3], [6, 3, 2.5], [18, -3, 2], [-2, -6, 2]].map(([x, y, r]) => fine(ink(ellipse(x, y, r, r * 0.35)))),
  ]);
}
// Well plate: a plate of 4 by 6 wells, seen from above.
function wellPlate() {
  const wells = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) wells.push(fine(ink(circle(-30 + c * 12, -18 + r * 12, 4.2))));
  return art("Well plate", "microplate, 24-well plate, 96-well plate, assay", PER, [
    ink(`M-40 -30L32 -30L40 -22L40 30L-40 30Z`), ...wells, fill(circle(-30, -18, 4.2), "light"), fill(circle(-18, -6, 4.2), "light"), fill(circle(6, 6, 4.2), "light"),
  ]);
}
// Test tube rack: a rack with three tubes in it.
function rack() {
  const tube = (x, h, liquid) => [fill(`M${x - 5} ${liquid}L${x + 5} ${liquid}L${x + 5} 30Q${x + 5} 36 ${x} 36Q${x - 5} 36 ${x - 5} 30Z`), ink(`M${x - 5} ${-h}L${x - 5} 30Q${x - 5} 36 ${x} 36Q${x + 5} 36 ${x + 5} 30L${x + 5} ${-h}`)];
  return art("Test tube rack", "rack, test tubes", PER, [
    ...tube(-22, 40, 10), ...tube(0, 44, 4), ...tube(22, 40, 16),
    ink(`M-40 -12L40 -12L40 -6L-40 -6Z`), ink(`M-40 42L40 42L40 48L-40 48Z`), ink(`M-36 -6L-36 42M36 -6L36 42`),
  ]);
}
// Wash bottle: a squeeze bottle with a bent spout.
function washBottle() {
  return art("Wash bottle", "squeeze bottle, solvent, rinse", PER, [
        ink(`M-8 -30L-8 -24Q-20 -20 -20 -8L-20 32Q-20 40 -12 40L12 40Q20 40 20 32L20 -8Q20 -20 8 -24L8 -30`), ink(rect(-10, -38, 20, 8, 2)),
    ink(`M-2 -38L-2 -50Q-2 -56 6 -58L30 -64M2 -38L2 -48Q2 -52 8 -53L31 -60`),
  ]);
}
// Balance: an analytical balance with its pan, draft shield and display.
function balance() {
  return art("Balance", "analytical balance, scales, weighing", PER, [
    ink(rect(-44, 22, 88, 20, 4)), ink(rect(-30, 28, 26, 9, 2)), fine(ink(`M-26 33L-8 33`)), ink(circle(22, 32, 3)), ink(circle(32, 32, 3)),
    ink(`M-34 22L-34 -34L34 -34L34 22`), fine(ink(`M-34 -26L34 -26`)), ink(`M-20 16L20 16M0 16L0 22`), ink(ellipse(0, 14, 20, 3)),
  ]);
}
// Centrifuge: a benchtop centrifuge with its domed lid and dial.
function centrifuge() {
  return art("Centrifuge", "microcentrifuge, spin, rotor", PER, [
    ink(`M-40 -4Q-40 -26 0 -28Q40 -26 40 -4Z`), ink(`M-44 -4L44 -4L40 34L-40 34Z`), fine(ink(ellipse(0, -10, 22, 7))),
    ink(rect(-26, 10, 22, 12, 2)), ink(circle(18, 16, 6)), fine(ink(seg(18, 16, 18, 11))),
  ]);
}
// Gel electrophoresis: a gel seen from above, with its wells and bands in lanes.
function gel() {
  const bands = [[0, [-14, 0, 14]], [1, [-20, -6, 8, 18]], [2, [-14, 2, 20]], [3, [-22, -10, 4, 12]], [4, [-18, -2, 10]]];
  return art("Gel electrophoresis", "agarose gel, SDS-PAGE, DNA ladder, bands, Western blot", PER, [
    ink(rect(-36, -32, 72, 64, 3)),
    ...[0, 1, 2, 3, 4].map((k) => fine(ink(rect(-30 + k * 13, -28, 8, 4, 1)))),
    ...bands.flatMap(([k, ys]) => ys.map((y) => solid(rect(-30 + k * 13, y, 8, 2.4, 1.2)))),
  ]);
}
// Spectrophotometer: a bench instrument with a cuvette lid and a display.
function spectrophotometer() {
  return art("Spectrophotometer", "UV-Vis, absorbance, photometer", PER, [
    ink(`M-44 -18L44 -18L44 26L-44 26Z`), ink(`M-36 -18L-32 -30L4 -30L8 -18`), fine(ink(rect(-26, -27, 22, 5, 1.5))),
    ink(rect(12, -10, 26, 14, 2)), fine(ink(`M15 0L20 -6L25 -2L30 -8L35 -4`)), ...[-30, -20, -10].map((x) => ink(rect(x, 8, 7, 7, 1.5))),
  ]);
}
// Mortar and pestle.
function mortar() {
  return art("Mortar and pestle", "grinding, mortar, pestle", PER, [
        ink(`M-34 -10Q-30 24 0 24Q30 24 34 -10`), ink(ellipse(0, -10, 34, 8)), ink(rect(-14, 24, 28, 6, 2)),
    ink(`M6 -6L30 -44Q34 -50 39 -47Q44 -44 40 -38L14 -2`),
  ]);
}
// Crucible with its lid.
function crucible() {
  return art("Crucible", "porcelain crucible, ignition, ashing", PER, [
    ink(`M-20 -12L-14 22Q-13 26 -8 26L8 26Q13 26 14 22L20 -12`), ink(ellipse(0, -12, 20, 5)),
    ink(`M-24 -26Q0 -36 24 -26L24 -23Q0 -32 -24 -23Z`), ink(rect(-4, -36, 8, 5, 2)),
  ]);
}
// Spatula: a laboratory spatula with a flat end and a spoon end.
function spatula() {
  return art("Spatula", "spoon spatula, weighing", PER, [
    ink(`M-60 -3L44 -3L50 -6Q60 -8 60 0Q60 8 50 6L44 3L-60 3Q-66 3 -66 0Q-66 -3 -60 -3Z`), fine(ink(`M-60 0L-20 0`)),
  ]);
}
// Scalpel, tweezers and scissors.
function scalpel() {
  return art("Scalpel", "blade, dissection, knife", PER, [
    ink(`M-60 -3L6 -3L6 3L-60 3Q-64 3 -64 0Q-64 -3 -60 -3Z`), fine(ink(seg(-40, -3, -40, 3))), ink(`M6 -3L20 -6Q44 -10 56 0Q40 2 20 3L6 3`),
  ]);
}
function tweezers() {
  return art("Tweezers", "forceps, pincers", PER, [ink(`M-60 -3L-56 -3L40 -10L60 -2M-60 3L-56 3L40 10L60 2M-60 -3Q-64 0 -60 3`)]);
}
function scissors() {
  return art("Scissors", "dissection, cutting", PER, [
    ink(circle(-34, -14, 10)), ink(circle(-34, 14, 10)), ink(`M-25 -9L44 12M-25 9L44 -12`), fine(ink(circle(0, 0, 1.6))),
  ]);
}
// Gloves, safety glasses, a magnifying glass and a lab notebook.
function glove() {
  return art("Glove", "nitrile glove, safety, PPE", PER, [
        ink(`M-14 40L-16 4L-26 -14Q-30 -22 -24 -24Q-18 -26 -14 -16L-10 -8L-10 -40Q-10 -46 -5 -46Q0 -46 0 -40L0 -14L2 -46Q2 -52 7 -52Q12 -52 12 -46L11 -14L14 -42Q15 -47 20 -47Q25 -46 24 -41L21 -12L26 -34Q28 -39 32 -38Q36 -37 35 -32L30 2L26 40Z`),
    ink(`M-15 32L27 32`),
  ]);
}
function safetyGlasses() {
  return art("Safety glasses", "goggles, eye protection, PPE", PER, [
    ink(`M-46 -10L-6 -10Q-4 14 -24 16Q-44 16 -46 -10Z`), ink(`M46 -10L6 -10Q4 14 24 16Q44 16 46 -10Z`), ink(`M-6 -10Q0 -16 6 -10`),
    ink(`M-46 -10L-56 -14M46 -10L56 -14`), fine(ink(`M-38 -4L-30 4`)), fine(ink(`M14 -4L22 4`)),
  ]);
}
function magnifier() {
  return art("Magnifying glass", "magnifier, lens, inspect", PER, [
    ink(circle(-10, -10, 22)), ink(`M6 6L10 10M10 10L30 30Q34 34 30 38Q26 42 22 38L2 18`), fine(ink(`M-22 -18Q-20 -26 -12 -28`)),
  ]);
}
function notebook() {
  const lines = [-14, -4, 6, 16, 26].map((y) => fine(ink(seg(-16, y, 22, y))));
  return art("Notebook", "lab notebook, notes, record", PER, [
    ink(rect(-28, -40, 56, 76, 3)), ink(`M-20 -40L-20 36`), ...[-32, -16, 0, 16, 28].map((y) => ink(circle(-28, y, 2.5))), ink(rect(-12, -32, 30, 10, 1.5)), ...lines,
  ]);
}

export const EQUIPMENT = [microscope(), micropipette(), microtube(), centrifugeTube(), petriDish(), wellPlate(), rack(), washBottle(), balance(),
  centrifuge(), gel(), spectrophotometer(), mortar(), crucible(), spatula(), scalpel(), tweezers(), scissors(), glove(), safetyGlasses(), magnifier(), notebook()];
