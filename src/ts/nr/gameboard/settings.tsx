// In-game settings panel: sound, display, accessibility options.
// Mirrors: src/cljs/nr/gameboard/settings.cljs
import React from "react";
import { useAppState } from "../appstate";
import { PUT } from "../ajax";
import { trElement, trSpan } from "../translations";

// Helper: access an option key from UserSettings (kebab-case keys)
function getOption(options: Record<string, unknown>, key: string): unknown {
  return options[key];
}

function SettingsPane(): React.ReactElement {
  const options = useAppState(s => s.options);
  const setOptions = useAppState(s => s.setOptions);

  const handleSave = async () => {
    const lang = options["language"] as string | undefined;
    const params = lang ? { ...options, lang } : { ...options };
    await PUT("/profile", JSON.stringify({ options: params }), "json");
  };

  // Checkbox change handler factory
  const onCheckboxChange = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setOptions({ [key]: e.target.checked });
  };

  // Radio change handler factory
  const onRadioChange = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setOptions({ [key]: e.target.value });
  };

  // Runner board order radio options
  const runnerBoardOptions = [
    { name: ["ingame-settings_runner-classic", "classic"] as [string, string], ref: "jnet" },
    { name: ["ingame-settings_runner-reverse", "reversed"] as [string, string], ref: "irl" },
  ];

  // Card back display radio options
  const cardBackOptions = [
    { name: ["settings_card-backs-their-choice", "Their Choice"] as [string, string], ref: "them" },
    { name: ["settings_card-backs-my-choice", "My Choice"] as [string, string], ref: "me" },
    { name: ["settings_card-backs-ffg", "FFG Card Back"] as [string, string], ref: "ffg" },
    { name: ["settings_card-backs-nsg", "NSG Card Back"] as [string, string], ref: "nsg" },
  ];

  // Card preview zoom radio options
  const cardZoomOptions = [
    { name: ["ingame-settings_card-image", "Card Image"] as [string, string], ref: "image" },
    { name: ["ingame-settings_card-text", "Card Text"] as [string, string], ref: "text" },
  ];

  return (
    <div className="settings">
      <section>
        <button onClick={handleSave}>{trSpan(["ingame-settings_save", "Save"])}</button>
      </section>

      {/* Card settings */}
      <section>
        {trElement("h4", ["ingame-settings_card-stacking", "Card settings"])}
        <div>
          <label>
            <input
              type="checkbox"
              defaultChecked={false}
              checked={Boolean(getOption(options, "stacked-cards"))}
              onChange={onCheckboxChange("stacked-cards")}
            />
            {trSpan(["ingame-settings_stack-cards", "Stack cards"])}
          </label>
        </div>
        <div>
          <label>
            <input
              type="checkbox"
              defaultChecked={false}
              checked={Boolean(getOption(options, "ghost-trojans"))}
              onChange={onCheckboxChange("ghost-trojans")}
            />
            {trSpan(["ingame-settings_ghost-trojans", "Display hosted trojans in rig"])}
          </label>
        </div>
        <div>
          <label>
            <input
              type="checkbox"
              defaultChecked={false}
              checked={Boolean(getOption(options, "display-encounter-info"))}
              onChange={onCheckboxChange("display-encounter-info")}
            />
            {trSpan(["ingame-settings_display-encounter-info", "Always display encounter info"])}
          </label>
        </div>
      </section>

      {/* Gameplay Settings */}
      <section>
        {trElement("h4", ["ingame-settings_game-settings", "Gameplay Settings"])}
        <div>
          <label>
            <input
              type="checkbox"
              defaultChecked={false}
              checked={Boolean(getOption(options, "pass-on-rez"))}
              onChange={onCheckboxChange("pass-on-rez")}
            />
            {trSpan(["ingame-settings_pass-on-rez", "Pass priority when rezzing ice"])}
          </label>
        </div>
      </section>

      {/* Sorting */}
      <section>
        {trElement("h4", ["ingame-settings_card-sorting", "Sorting"])}
        <div>
          <label>
            <input
              type="checkbox"
              defaultChecked={false}
              checked={Boolean(getOption(options, "archives-sorted"))}
              onChange={onCheckboxChange("archives-sorted")}
            />
            {trSpan(["ingame-settings_sort-archives", "Sort Archives"])}
          </label>
        </div>
        <div>
          <label>
            <input
              type="checkbox"
              defaultChecked={false}
              checked={Boolean(getOption(options, "heap-sorted"))}
              onChange={onCheckboxChange("heap-sorted")}
            />
            {trSpan(["ingame-settings_sort-heap", "Sort Heap"])}
          </label>
        </div>
      </section>

      {/* Runner board order */}
      <section>
        {trElement("h4", ["ingame-settings_runner-board-order", "Runner board order"])}
        {runnerBoardOptions.map(option => (
          <div className="radio" key={String(option.name)}>
            <label>
              <input
                type="radio"
                name="runner-board-order"
                value={option.ref}
                onChange={onRadioChange("runner-board-order")}
                checked={getOption(options, "runner-board-order") === option.ref}
              />
              {trSpan(option.name)}
            </label>
          </div>
        ))}
      </section>

      {/* Log timestamps */}
      <section>
        {trElement("h4", ["ingame-settings_log-timestamps", "Log timestamps"])}
        <div>
          <label>
            <input
              type="checkbox"
              defaultChecked={false}
              checked={Boolean(getOption(options, "log-timestamps"))}
              onChange={onCheckboxChange("log-timestamps")}
            />
            {trSpan(["ingame-settings_log-timestamps-toggle", "Show log timestamps"])}
          </label>
        </div>
      </section>

      {/* Display Opponent Card backs */}
      <section>
        {trElement("h4", ["ingame-settings_card-back-display", "Display Opponent Card backs"])}
        {cardBackOptions.map(option => (
          <div className="radio" key={String(option.name)}>
            <label>
              <input
                type="radio"
                name="card-back-display"
                value={option.ref}
                onChange={onRadioChange("card-back-display")}
                checked={getOption(options, "card-back-display") === option.ref}
              />
              {trSpan(option.name)}
            </label>
          </div>
        ))}
      </section>

      {/* Card preview zoom */}
      <section>
        {trElement("h4", ["ingame-settings_preview-zoom", "Card preview zoom"])}
        {cardZoomOptions.map(option => (
          <div className="radio" key={String(option.name)}>
            <label>
              <input
                type="radio"
                name="card-zoom"
                value={option.ref}
                onChange={onRadioChange("card-zoom")}
                checked={getOption(options, "card-zoom") === option.ref}
              />
              {trSpan(option.name)}
            </label>
          </div>
        ))}
        <div>
          <label>
            <input
              type="checkbox"
              name="pin-base-art"
              checked={Boolean(getOption(options, "pin-base-art"))}
              onChange={onCheckboxChange("pin-base-art")}
            />
            {trSpan(["settings_pin-base-art", "Zoomed cards always use base art"])}
          </label>
        </div>
        <div>
          <label>
            <input
              type="checkbox"
              name="pin-zoom"
              checked={Boolean(getOption(options, "pin-zoom"))}
              onChange={onCheckboxChange("pin-zoom")}
            />
            {trSpan(["settings_pin-zoom", "Keep zoomed cards on screen"])}
          </label>
        </div>
      </section>

      {/* Alt arts */}
      <section>
        {trElement("h4", ["ingame-settings_alt-art", "Alt arts"])}
        <div>
          <label>
            <input
              type="checkbox"
              name="show-alt-art"
              checked={Boolean(getOption(options, "show-alt-art"))}
              onChange={onCheckboxChange("show-alt-art")}
            />
            {trSpan(["ingame-settings_show-alt", "Show alternate card arts"])}
          </label>
        </div>
      </section>

      {/* Device-specific settings */}
      <section>
        {trElement("h4", ["ingame-settings_device-specific", "Device-specific settings"])}
        {trElement("p", ["ingame-settings_device-specific-note", "These settings are stored locally and do not sync."])}
        <div>
          <label>
            <input
              type="checkbox"
              defaultChecked={false}
              checked={Boolean(getOption(options, "labeled-unrezzed-cards"))}
              onChange={onCheckboxChange("labeled-unrezzed-cards")}
            />
            {trSpan(["ingame-settings_label-unrezzed-cards", "Label unrezzed cards"])}
          </label>
        </div>
        <div>
          <label>
            <input
              type="checkbox"
              defaultChecked={false}
              checked={Boolean(getOption(options, "labeled-cards"))}
              onChange={onCheckboxChange("labeled-cards")}
            />
            {trSpan(["ingame-settings_label-faceup-cards", "Label face up cards"])}
          </label>
        </div>
        <div>
          <label>
            <input
              type="checkbox"
              defaultChecked={false}
              checked={Boolean(getOption(options, "sides-overlap"))}
              onChange={onCheckboxChange("sides-overlap")}
            />
            {trSpan(["ingame-settings_sides-overlap", "Runner and Corp may overlap"])}
          </label>
        </div>
        <div>
          <label>
            <input
              type="checkbox"
              name="use-high-res"
              checked={getOption(options, "card-resolution") === "high"}
              onChange={(e) => setOptions({ "card-resolution": e.target.checked ? "high" : "default" })}
            />
            {trSpan(["ingame-settings_high-res", "Enable high resolution card images"])}
          </label>
        </div>
      </section>
    </div>
  );
}

export { SettingsPane as GameboardSettings };
export default SettingsPane;
