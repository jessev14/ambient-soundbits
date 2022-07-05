import { libWrapper } from "../lib/shim.js";

export const moduleName = "ambient-soundbits";

const soundbitDefaultData = {
    radius: 0,
    easing: false,
    repeat: false,
    walls: false
};


Hooks.once("init", () => {
    // Keep ambient sound placeables visible on other layers
    libWrapper.register(moduleName, "CONFIG.Canvas.layers.sounds.layerClass.prototype.deactivate", newDeactivate, "WRAPPER");

    // Show/hide ambient sound ranges
    libWrapper.register(moduleName, "CONFIG.AmbientSound.objectClass.prototype.refresh", new_ambientSoundRefresh, "WRAPPER");

    // Cancel ambient sound draw workflow if soundbit tool is active
    libWrapper.register(moduleName, "CONFIG.Canvas.layers.sounds.layerClass.prototype._onDragLeftStart", cancelDrawing, "MIXED");
    libWrapper.register(moduleName, "CONFIG.Canvas.layers.sounds.layerClass.prototype._onDragLeftMove", cancelDrawing, "MIXED");

    // If soundbit tool active, create soundbit on canvas left click
    libWrapper.register(moduleName, "CONFIG.Canvas.layers.sounds.layerClass.prototype._onClickLeft", createSoundbit, "WRAPPER");

    // If Shift held during drag&drop, create soundbit instead
    libWrapper.register(moduleName, "CONFIG.Canvas.layers.sounds.layerClass.prototype._onDropData", dropSoundbit, "MIXED");

    // Change soundbit icon
    libWrapper.register(moduleName, "CONFIG.AmbientSound.objectClass.prototype.refreshControl", new_refreshControl, "WRAPPER");
    libWrapper.register(moduleName, "CONFIG.AmbientSound.objectClass.prototype._drawControlIcon", new_drawControlIcon, "OVERRIDE");

    // Add tooltip to soundbit control icon
    libWrapper.register(moduleName, "CONFIG.AmbientSound.objectClass.prototype.draw", new_draw, "WRAPPER");

    // Play soundbit on right-click
    libWrapper.register(moduleName, "CONFIG.AmbientSound.objectClass.prototype._onClickRight", playSoundbit, "MIXED");

    // Allow soundbits to be hovered on any layer
    CONFIG.AmbientSound.objectClass.prototype._canHover = function () {
        return this.layer._active || this.document.getFlag(moduleName, "soundbit");
    };

    // Register module settings
    game.settings.register(moduleName, "soundsVisible", {
        scope: "world",
        type: Boolean,
        default: false,
        onChange: () => canvas.sounds.placeables.forEach(p => p.refresh())
    });

    game.settings.register(moduleName, "soundRangesVisible", {
        scope: "world",
        type: Boolean,
        default: true,
        onChange: () => canvas.sounds.placeables.forEach(p => p.refresh())
    });

    // Register socket handler
    game.socket.on(`module.${moduleName}`, async data => {
        const { action } = data;

        if (action === "playSoundbit") {
            const { src } = data;
            const sound = await game.audio.play(src, { volume: 1 });
            sound.id = data.id;
        }

        if (action === "stopSoundbit") {
            const { id } = data;
            for (const playing of Array.from(game.audio.playing.values())) {
                if (playing.id === id && playing.playing) {
                    playing.stop();
                    break;
                }
            }
        }
    });

    // Register module hotkeys
    game.keybindings.register(moduleName, "playSoundbit", {
        name: "Play/Stop Hovered Soundbit",
        editable: [
            {
                key: "KeyP"
            }
        ],
        onDown: () => {
            const soundbit = canvas.sounds._hover;
            if (!soundbit?.document.getFlag(moduleName, "soundbit")) return;

            playSoundbit.call(soundbit);
        }
    })
});

// Load textures
Hooks.once("setup", async () => {
    await loadTexture(`modules/${moduleName}/img/play-circle-solid.svg`);
    await loadTexture(`modules/${moduleName}/img/pause-circle-solid.svg`);
});


// Add new buttons to sound toolbar
Hooks.on("getSceneControlButtons", controls => {
    if (game.user.role < 3) return;

    const bar = controls.find(c => c.name === "sounds");
    bar.tools.splice(1, 0,
        {
            "name": "soundbit",
            "title": "Draw Ambient Soundbit",
            "icon": "fas fa-play-circle",
        }
    );

    bar.tools.splice(3, 0,
        {
            "name": "toggleDisplay",
            "title": "Toggle Ambient Sound Display",
            "icon": "fas fa-map-pin",
            onClick: toggled => game.settings.set(moduleName, "soundsVisible", toggled),
            "toggle": true,
            "active": game.settings.get(moduleName, "soundsVisible")
        },
        {
            "name": "toggleRange",
            "title": "Toggle Ambient Sound Range Display",
            "icon": "far fa-circle",
            onClick: toggled => game.settings.set(moduleName, "soundRangesVisible", toggled),
            "toggle": true,
            "active": game.settings.get(moduleName, "soundRangesVisible")
        }
    );
});

// Add soundbit checkbox to ambient sound config
Hooks.on("renderAmbientSoundConfig", (app, html, data) => {
    const soundbitCheck = document.createElement(`div`);
    soundbitCheck.classList.add("form-group");
    soundbitCheck.innerHTML = `
        <label>Soundbit</label>
        <input type="checkbox" name="flags.${moduleName}.soundbit" ${app.object.getFlag(moduleName, "soundbit") ? "checked" : ""}>
        </div>
    `;
    html[0].querySelector(`button[type="submit"]`).before(soundbitCheck);
    app.setPosition({ height: "auto" });
});

// If flagging ambient sound as soundbit, update radius to 0
Hooks.on("preUpdateAmbientSound", (sound, diff, options, userID) => {
    if (diff.flags?.[moduleName]?.soundbit) return sound.update({ radius: 0 });
});

// Re-draw ambient sound objects to apply new tooltip text
Hooks.on("updateAmbientSound", (sound, options, userID) => {
    return sound.object.draw();
});


function newDeactivate(wrapper) {
    wrapper();

    const soundsVisible = game.settings.get(moduleName, "soundsVisible") && game.user.role > 2;
    if (this.objects) {
        this.objects.visible = soundsVisible;
        this.placeables.forEach(p => p.controlIcon.visible = soundsVisible);
    }
    this.interactiveChildren = true;

    return this;
}

function new_ambientSoundRefresh(wrapper) {
    const _this = wrapper();

    if (!game.settings.get(moduleName, "soundRangesVisible")) _this.field.clear();

    return _this;
}

async function cancelDrawing(wrapper, event) {
    if (ui.controls.tool.name !== "soundbit") return wrapper(event);
}

async function createSoundbit(wrapper, event) {
    wrapper(event);
    if (ui.controls.tool.name !== "soundbit") return;

    const origin = event.data.origin;
    const doc = new AmbientSoundDocument({ x: origin.x, y: origin.y, type: "l", flags: { [moduleName]: { soundbit: true } } }, { parent: canvas.scene });
    const sound = new AmbientSound(doc);
    this.preview.addChild(sound);
    await sound.draw();
    sound.sheet.render(true, { top: event.clientY - 20, left: event.clientX + 40 });
}

async function dropSoundbit(wrapper, event, data) {
    if (!event.shiftKey) return wrapper(event, data);

    const playlist = game.playlists.get(data.playlistId);
    const sound = playlist?.sounds.get(data.soundId);
    if (!sound) return false;

    // Get the world-transformed drop position.
    const coords = this._canvasCoordinatesFromDrop(event);
    if (!coords) return false;
    const soundData = {
        path: sound.data.path,
        volume: 1,
        x: coords[0],
        y: coords[1],
        flags: { [moduleName]: { soundbit: true } }
    };
    mergeObject(soundData, soundbitDefaultData);
    return this._createPreview(soundData, { top: event.clientY - 20, left: event.clientX + 40 });
}

function new_refreshControl(wrapper) {
    wrapper();
    if (!this.document.getFlag(moduleName, "soundbit")) return;

    const texture = this.soundbit ? `modules/${moduleName}/img/pause-circle-solid.svg` : `modules/${moduleName}/img/play-circle-solid.svg`;
    this.controlIcon.texture = getTexture(texture);
    this.controlIcon.draw();
    this.controlIcon.visible = true;
    this.controlIcon.border.visible = this._hover;

    if (this.tooltip) this.tooltip.visible = this._hover;
}

function new_drawControlIcon() {
    const size = Math.max(Math.round((canvas.dimensions.size * 0.5) / 20) * 20, 40);
    const texture = !this.document.getFlag(moduleName, "soundbit")
        ? CONFIG.controlIcons.sound
        : `modules/${moduleName}/img/play-circle-solid.svg`;
    let icon = new ControlIcon({ texture, size: size });
    icon.x -= (size * 0.5);
    icon.y -= (size * 0.5);
    return icon;
}

async function new_draw(wrapper) {
    await wrapper();
    if (!this.document.data.path) return this;

    // Create the Text object
    const textStyle = PreciseText.getTextStyle();
    const text = new PreciseText(getFileName(this.document.data.path), textStyle);
    text.visible = false;
    const halfPad = (0.5 * 40) + 12;

    // Configure Text position
    text.anchor.set(0.5, 0);
    text.position.set(0, halfPad);

    this.tooltip = this.addChild(text);

    return this;
}

async function playSoundbit(wrapper, event) {
    if (!this.document.getFlag(moduleName, "soundbit")) return wrapper(event);

    // Stop soundbit if currently playing
    let isPlaying = false;
    for (const playing of Array.from(game.audio.playing.values())) {
        if (playing.id === this.id && playing.playing) {
            isPlaying = true;
            playing.stop();
            this.soundbit = null;
            this.refresh();
            break;
        }
    }

    // Stop playing on other clients
    if (isPlaying) return game.socket.emit(`module.${moduleName}`, { action: "stopSoundbit", id: this.id });

    // Play soundbit
    const src = this.document.data.path;
    if (!src) return ui.notifications.warn("No sound source set.");

    this.soundbit = await game.audio.play(src, { volume: 1 });
    this.soundbit.on("end", () => {
        this.soundbit = null;
        this.refresh();
    });
    this.soundbit.id = this.id;

    // Play soundbit on other clients
    game.socket.emit(`module.${moduleName}`, { action: "playSoundbit", src, id: this.id });

    // Update control icon texture
    this.controlIcon.texture = getTexture(`modules/${moduleName}/img/pause-circle-solid.svg`);
    this.controlIcon.draw();
}


const getFileName = (str) => {
    return decodeURI(str.split('\\').pop().split('/').pop().split('.')[0]);
}
