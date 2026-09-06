/**
 * Golden resolution results for the Blender GLB animation corpus.
 *
 * Each entry is `<glTF animation name>|<propsrig input path>`, in resolution
 * order. These are literal expected values, deliberately NOT re-derived from
 * the path helpers: the corpus test compares resolver output against these
 * strings so that a change to `normalizeStandardRigGroup`, `sanitizeMorphKey`,
 * or the propsrig path template shows up as a concrete diff here.
 *
 * Comparing resolver output against a catalog built with the same helpers
 * would be symmetric and could never fail on a rule change, which is exactly
 * the mistake this file exists to prevent.
 *
 * Reseed only for an intentional rule change, and review the diff: every line
 * that moves is an animation binding that will break for existing content.
 *
 * Source assets: `public/assets/{Quori,Hugo,Toasty}_Latest_Blender_Export.glb`
 * resolved against `public/assets/{Quori,Hugo,Toasty}_Current.glb`.
 * See docs/plans/GLB_ANIMATION_ROUNDTRIP_PLAN_2026-09-02.md.
 */

export const QUORI_RESOLVED: ReadonlyArray<string> = [
  "Face_Tran_CAction|/propsrig/face_tran_rot_c/translation/x",
  "Face_Tran_CAction|/propsrig/face_tran_rot_c/translation/y",
  "Face_Tran_CAction|/propsrig/face_tran_rot_c/translation/z",
  "R_Eye_GeoAction|/propsrig/r_eye/scale/x",
  "R_Eye_GeoAction|/propsrig/r_eye/scale/y",
  "R_Eye_GeoAction|/propsrig/r_eye/scale/z",
  "L_Highlight_Scale_C.001Action.001|/propsrig/r_eyehighlight/scale/x",
  "L_Highlight_Scale_C.001Action.001|/propsrig/r_eyehighlight/scale/y",
  "L_Highlight_Scale_C.001Action.001|/propsrig/r_eyehighlight/scale/z",
  "L_Eye_GeoAction.002|/propsrig/l_eye/scale/x",
  "L_Eye_GeoAction.002|/propsrig/l_eye/scale/y",
  "L_Eye_GeoAction.002|/propsrig/l_eye/scale/z",
  "L_Highlight_Scale_CAction.005|/propsrig/l_eyehighlight/scale/x",
  "L_Highlight_Scale_CAction.005|/propsrig/l_eyehighlight/scale/y",
  "L_Highlight_Scale_CAction.005|/propsrig/l_eyehighlight/scale/z",
  "Key.001Action.001|/propsrig/lblid/lidcurve/value",
  "LBLid_CAction|/propsrig/lblid/translation/x",
  "LBLid_CAction|/propsrig/lblid/translation/y",
  "LBLid_CAction|/propsrig/lblid/translation/z",
  "Key.002Action.001|/propsrig/ltlid/lidcurve/value",
  "LTLid_CAction.001|/propsrig/ltlid/translation/x",
  "LTLid_CAction.001|/propsrig/ltlid/translation/y",
  "LTLid_CAction.001|/propsrig/ltlid/translation/z",
  "LTLid_CAction.001|/propsrig/ltlid/rotation/x",
  "LTLid_CAction.001|/propsrig/ltlid/rotation/y",
  "LTLid_CAction.001|/propsrig/ltlid/rotation/z",
  "Key.001Action.002|/propsrig/rblid/lidcurve/value",
  "LBLid_CAction.001|/propsrig/rblid/translation/x",
  "LBLid_CAction.001|/propsrig/rblid/translation/y",
  "LBLid_CAction.001|/propsrig/rblid/translation/z",
  "Key.002Action.002|/propsrig/rtlid/lidcurve/value",
  "LTLid_CAction.002|/propsrig/rtlid/translation/x",
  "LTLid_CAction.002|/propsrig/rtlid/translation/y",
  "LTLid_CAction.002|/propsrig/rtlid/translation/z",
  "LTLid_CAction.002|/propsrig/rtlid/rotation/x",
  "LTLid_CAction.002|/propsrig/rtlid/rotation/y",
  "LTLid_CAction.002|/propsrig/rtlid/rotation/z",
];

export const HUGO_RESOLVED: ReadonlyArray<string> = [
  "Face_Tran_CAction|/propsrig/face_tran_rot_c/translation/x",
  "Face_Tran_CAction|/propsrig/face_tran_rot_c/translation/y",
  "Face_Tran_CAction|/propsrig/face_tran_rot_c/translation/z",
  "L_EyeAction|/propsrig/l_eye/scale/x",
  "L_EyeAction|/propsrig/l_eye/scale/y",
  "L_EyeAction|/propsrig/l_eye/scale/z",
  "Key.001Action.001|/propsrig/lblid/lidcurve/value",
  "LBLid_CAction|/propsrig/lblid/translation/x",
  "LBLid_CAction|/propsrig/lblid/translation/y",
  "LBLid_CAction|/propsrig/lblid/translation/z",
  "Key.002Action.001|/propsrig/ltlid/lidcurve/value",
  "LTLid_CAction.001|/propsrig/ltlid/translation/x",
  "LTLid_CAction.001|/propsrig/ltlid/translation/y",
  "LTLid_CAction.001|/propsrig/ltlid/translation/z",
  "LTLid_CAction.001|/propsrig/ltlid/rotation/x",
  "LTLid_CAction.001|/propsrig/ltlid/rotation/y",
  "LTLid_CAction.001|/propsrig/ltlid/rotation/z",
  "R_EyeAction|/propsrig/r_eye/scale/x",
  "R_EyeAction|/propsrig/r_eye/scale/y",
  "R_EyeAction|/propsrig/r_eye/scale/z",
  "Key.001Action.002|/propsrig/rblid/lidcurve/value",
  "LBLid_CAction.001|/propsrig/rblid/translation/x",
  "LBLid_CAction.001|/propsrig/rblid/translation/y",
  "LBLid_CAction.001|/propsrig/rblid/translation/z",
  "Key.002Action.002|/propsrig/rtlid/lidcurve/value",
  "LTLid_CAction.002|/propsrig/rtlid/translation/x",
  "LTLid_CAction.002|/propsrig/rtlid/translation/y",
  "LTLid_CAction.002|/propsrig/rtlid/translation/z",
  "LTLid_CAction.002|/propsrig/rtlid/rotation/x",
  "LTLid_CAction.002|/propsrig/rtlid/rotation/y",
  "LTLid_CAction.002|/propsrig/rtlid/rotation/z",
];

export const TOASTY_RESOLVED: ReadonlyArray<string> = [
  "Key.003Action|/propsrig/l_tlid/lid_updn/value",
  "Key.003Action|/propsrig/l_tlid/curveup/value",
  "Key.003Action|/propsrig/l_tlid/curvedn/value",
  "Key.001Action|/propsrig/r_tlid/lid_updn/value",
  "Key.001Action|/propsrig/r_tlid/curveup/value",
  "Key.001Action|/propsrig/r_tlid/curvedn/value",
  "Key.011Action|/propsrig/faceshadowgeo/round/value",
  "Key.011Action|/propsrig/faceshadowgeo/fullscreen/value",
];
