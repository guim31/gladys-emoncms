// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`): keys permanent once published.
//
// `send_value` posts one value to an Emoncms input, as an emonTx would: the
// equivalent of Home Assistant's `emoncms_history`, driven by a scene. The
// core substitutes the scene variables in the fields before relaying them
// (a device value read by a previous action, an event variable).
// -----------------------------------------------------------------------------

export const SCENE_ACTIONS = {
  send_value: (hub, { fields = {} }) =>
    hub.postValue({ node: fields.node, name: fields.input, value: fields.value }),
};
