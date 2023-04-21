import { libWrapper } from '../lib/shim.js';
import { pauseMusic, resumeMusic } from './sound-manager.js';
import { createSoundWaves } from './soundwaves.js';

export const moduleName = 'ambient-soundbits';

const soundbitDefaultData = {
	//radius: 0,
	easing: false,
	repeat: false,
	walls: false,
};

Hooks.once('init', () => {
	// Keep ambient sound placeables visible on other layers
	libWrapper.register(moduleName, 'CONFIG.Canvas.layers.sounds.layerClass.prototype.deactivate', newDeactivate, 'WRAPPER');

	// Cancel ambient sound draw workflow if soundbit tool is active
	libWrapper.register(moduleName, 'CONFIG.Canvas.layers.sounds.layerClass.prototype._onDragLeftStart', cancelDrawing, 'MIXED');
	libWrapper.register(moduleName, 'CONFIG.Canvas.layers.sounds.layerClass.prototype._onDragLeftMove', cancelDrawing, 'MIXED');

	// If soundbit tool active, create soundbit on canvas left click
	//libWrapper.register(moduleName, 'CONFIG.Canvas.layers.sounds.layerClass.prototype._onClickLeft', createSoundbit, 'WRAPPER');

	// If Shift held during drag&drop, create soundbit instead
	libWrapper.register(moduleName, 'CONFIG.Canvas.layers.sounds.layerClass.prototype._onDropData', dropSoundbit, 'MIXED');

	// Show/hide ambient sound ranges
	libWrapper.register(moduleName, 'CONFIG.AmbientSound.objectClass.prototype.refresh', new_ambientSoundRefresh, 'WRAPPER');

	// Change soundbit icon
	libWrapper.register(moduleName, 'CONFIG.AmbientSound.objectClass.prototype.refreshControl', new_refreshControl, 'WRAPPER');
	libWrapper.register(moduleName, 'CONFIG.AmbientSound.objectClass.prototype._drawControlIcon', new_drawControlIcon, 'OVERRIDE');

	// Makes so Audio does not play if character is near the sound source
	libWrapper.register(moduleName, 'CONFIG.AmbientSound.objectClass.prototype.isAudible', isAudible, 'OVERRIDE');

	// Add tooltip to soundbit control icon
	libWrapper.register(moduleName, 'CONFIG.AmbientSound.objectClass.prototype.draw', new_draw, 'WRAPPER');

	//  Changes the canHover so Audio might be hovered in any layer
	libWrapper.register(moduleName, 'CONFIG.AmbientSound.objectClass.prototype._canHover', new_canHover, 'OVERRIDE');

	// Play soundbit on right-click
	libWrapper.register(moduleName, 'CONFIG.AmbientSound.objectClass.prototype._onClickRight', playSoundbit, 'MIXED');

	// Register module settings
	game.settings.register(moduleName, 'soundsVisible', {
		scope: 'world',
		type: Boolean,
		default: false,
		onChange: () => canvas.sounds.placeables.forEach((p) => p.refresh()),
	});

	game.settings.register(moduleName, 'soundRangesVisible', {
		scope: 'world',
		type: Boolean,
		default: true,
		onChange: () => canvas.sounds.placeables.forEach((p) => p.refresh()),
	});

	// Register socket handler
	game.socket.on(`module.${moduleName}`, async (data) => {
		const { action } = data;

		if (action === 'playSoundbit') {
			const { src, volume } = data;
			const sound = await game.audio.play(src, { volume });
			sound.id = data.id;
		}

		if (action === 'stopSoundbit') {
			const { id } = data;
			for (const playing of Array.from(game.audio.playing.values())) {
				if (playing.id === id && playing.playing) {
					playing.stop();
					break;
				}
			}
			CanvasAnimation.terminateAnimation(id);
		}
	});

	// Register module hotkeys
	game.keybindings.register(moduleName, 'playSoundbit', {
		name: 'Play/Stop Hovered Soundbit',
		editable: [
			{
				key: 'KeyP',
			},
		],
		onDown: () => {
			const soundbit = canvas.sounds.hover;
			if (!soundbit?.document.getFlag(moduleName, 'soundbit')) return;

			playSoundbit.call(soundbit);
		},
	});
});

// Load textures
Hooks.once('setup', async () => {
	await loadTexture(`modules/${moduleName}/img/play-circle-solid.svg`);
	await loadTexture(`modules/${moduleName}/img/pause-circle-solid.svg`);
});

// Add new buttons to sound toolbar
Hooks.on('getSceneControlButtons', (controls) => {
	if (game.user.role < 3) return;

	const bar = controls.find((c) => c.name === 'sounds');
	//bar.tools.splice(1, 0, {
	//	name: 'soundbit',
	//	title: 'Draw Ambient Soundbit',
	//	icon: 'fas fa-play-circle',
	//});

	bar.tools.splice(
		2,
		0,
		{
			name: 'toggleDisplay',
			title: 'Toggle Ambient Sound Display',
			icon: 'fas fa-map-pin',
			onClick: (toggled) => game.settings.set(moduleName, 'soundsVisible', toggled),
			toggle: true,
			active: game.settings.get(moduleName, 'soundsVisible'),
		},
		{
			name: 'toggleRange',
			title: 'Toggle Ambient Sound Range Display',
			icon: 'far fa-circle',
			onClick: (toggled) => game.settings.set(moduleName, 'soundRangesVisible', toggled),
			toggle: true,
			active: game.settings.get(moduleName, 'soundRangesVisible'),
		}
	);
});

// Add soundbit checkbox to ambient sound config
Hooks.on('renderAmbientSoundConfig', (app, html, data) => {
	const soundbit = $(`
    <fieldset style="margin-bottom: 5px">
    <legend style=" display: inline-flex; justify-content: center; align-items: center; margin: auto; padding-left: 10px;">
        Soundbit <input style="height: 15px; width: 15px;" type="checkbox" name="flags.${moduleName}.soundbit" ${
		app.object.getFlag(moduleName, 'soundbit') ? 'checked' : ''
	}>
    </legend>
    <p class="notes" style="text-align: center;">Soundbits are only played once, when the GM right clicks its icon.</p>
    <div class="form-group">
        <label>Global Sound</label>
        <input type="checkbox" name="flags.${moduleName}.global" ${app.object.getFlag(moduleName, 'global') ? 'checked' : ''}>
        <p class="notes">Sound will be played globally for all players, even for those outside its radius.</p>
    </div>
    <div class="form-group">
        <label>Pause Playlists</label>
        <input type="checkbox" name="flags.${moduleName}.pause" ${app.object.getFlag(moduleName, 'pause') ? 'checked' : ''}>
        <p class="notes">Track will pause while soundbit is playing.</p>
    </div>
    <div class="form-group">
        <label>Emit Soundwaves</label>
        <input type="checkbox" name="flags.${moduleName}.soundwaves" ${app.object.getFlag(moduleName, 'soundwaves') ? 'checked' : ''}>
        <p class="notes">Emits visible soundwaves when played.</p>
    </div>
    </fieldset>
    `);

	html[0].querySelector(`button[type="submit"]`).before(soundbit[0]);
	app.setPosition({ height: 'auto' });
});

// If flagging ambient sound as soundbit, update radius to 0
//Hooks.on('preUpdateAmbientSound', (sound, diff, options, userID) => {
//	if (diff.flags?.[moduleName]?.soundbit) return sound.update({ radius: 0 });
//});

// Re-draw ambient sound objects to apply new tooltip text
Hooks.on('updateAmbientSound', (sound, options, userID) => {
	return sound.object.draw();
});

function newDeactivate(wrapper) {
	wrapper();

	const soundsVisible = game.settings.get(moduleName, 'soundsVisible') && game.user.role > 2;
	if (this.objects) {
		this.objects.visible = soundsVisible;
		this.placeables.forEach((p) => (p.controlIcon.visible = soundsVisible));
	}
	this.interactiveChildren = true;

	return this;
}

function new_ambientSoundRefresh(wrapper) {
	const _this = wrapper();

	if (!game.settings.get(moduleName, 'soundRangesVisible')) _this.field.clear();
	if (this.document.getFlag(moduleName, 'soundbit')) {
		this.source.initialize({
			x: this.document.x,
			y: this.document.y,
			radius: Math.clamped(this.radius, 0, canvas.dimensions.maxR),
			walls: this.document.walls,
			z: this.document.getFlag('core', 'priority') ?? null,
		});
		this.field.beginFill(0xaaddff, 0.15).lineStyle(1, 0xffffff, 0.5).drawShape(this.source.los).endFill();
	}

	return _this;
}

async function cancelDrawing(wrapper, event) {
	if (ui.controls.tool !== 'soundbit') return wrapper(event);
}

//async function createSoundbit(wrapper, event) {
//	wrapper(event);
//	if (ui.controls.tool !== 'soundbit') return;
//
//	const origin = event.data.origin;
//	const doc = new AmbientSoundDocument({ x: origin.x, y: origin.y, type: 'l', flags: { [moduleName]: { soundbit: true } } }, { parent: canvas.scene });
//	const sound = new AmbientSound(doc);
//	this.preview.addChild(sound);
//	await sound.draw();
//	sound.sheet.render(true, { top: origin.y - 20, left: origin.x + 40 });
//}

async function dropSoundbit(wrapper, event, data) {
	if (!event.shiftKey) return wrapper(event, data);

	const playlist = game.playlists.get(data.playlistId);
	const sound = playlist?.sounds.get(data.soundId);
	if (!sound) return false;

	// Get the world-transformed drop position.
	const coords = this._canvasCoordinatesFromDrop(event);
	if (!coords) return false;
	const soundData = {
		path: sound.path,
		volume: sound.volume,
		x: coords[0],
		y: coords[1],
		flags: { [moduleName]: { soundbit: true } },
	};
	mergeObject(soundData, soundbitDefaultData);
	return this._createPreview(soundData, { top: event.clientY - 20, left: event.clientX + 40 });
}

function new_refreshControl(wrapper) {
	wrapper();
	if (!this.document.getFlag(moduleName, 'soundbit')) return;

	const texture = this.soundbit ? `modules/${moduleName}/img/pause-circle-solid.svg` : `modules/${moduleName}/img/play-circle-solid.svg`;
	this.controlIcon.texture = getTexture(texture);
	this.controlIcon.tintColor = 0xffffff;
	this.controlIcon.borderColor = 0xff5500;
	this.controlIcon.draw();
	this.controlIcon.visible = true;
	this.controlIcon.border.visible = this.hover;

	if (this.tooltip) this.tooltip.visible = this.hover;
}

function new_drawControlIcon() {
	const size = Math.max(Math.round((canvas.dimensions.size * 0.5) / 20) * 20, 40);
	const texture = !this.document.getFlag(moduleName, 'soundbit') ? CONFIG.controlIcons.sound : `modules/${moduleName}/img/play-circle-solid.svg`;
	let icon = new ControlIcon({ texture, size });
	icon.x -= size * 0.5;
	icon.y -= size * 0.5;
	return icon;
}

function new_canHover(wrapper, user, event) {
	// Allow soundbits to be hovered on any layer
	return this.layer.active || this.document.getFlag(moduleName, 'soundbit');
}

async function new_draw(wrapper) {
	await wrapper();
	if (!this.document.path) return this;

	// Create the Text object
	const textStyle = PreciseText.getTextStyle();
	const text = new PreciseText(getFileName(this.document.path), textStyle);
	text.visible = false;
	const halfPad = 0.5 * 40 + 12;

	// Configure Text position
	text.anchor.set(0.5, 0);
	text.position.set(0, halfPad);

	this.tooltip = this.addChild(text);

	return this;
}

function isAudible(wrapper) {
	if (this.document.hidden || this.document.getFlag(moduleName, 'soundbit')) return false;
	return canvas.darknessLevel.between(this.document.darkness.min ?? 0, this.document.darkness.max ?? 1);
}

function localVolume(sound) {
	const r = sound.radius;
	let listeners = canvas.tokens.controlled.map((t) => t.center);
	if (!listeners.length && !game.user.isGM)
		listeners = canvas.tokens.placeables.reduce((arr, t) => {
			if (t.actor?.isOwner && t.isVisible) arr.push(t.center);
			return arr;
		}, []);

	// Determine whether the sound is audible, and its greatest audible volume
	let globalVolume = 0;
	for (let l of listeners) {
		if (!sound.source.los?.contains(l.x, l.y)) continue;
		const distance = Math.hypot(l.x - sound.x, l.y - sound.y);
		let volume = sound.document.volume;
		if (sound.document.easing) volume *= canvas.sounds._getEasingVolume(distance, r);
		if (!globalVolume || volume > globalVolume) globalVolume = volume;
	}
	if (game.user.isGM && listeners.length === 0) globalVolume = sound.document.volume;
	return globalVolume;
}

async function playSoundbit(wrapper, event) {
	if (!this.document.getFlag(moduleName, 'soundbit')) return wrapper(event);

	// Stop soundbit if currently playing
	let isPlaying = false;
	for (const playing of Array.from(game.audio.playing.values())) {
		if (playing.id === this.id && playing.playing) {
			isPlaying = true;
			playing.stop();
			this.soundbit = null;
			this.refresh();
			resumeMusic(this.document);
			CanvasAnimation.terminateAnimation(this.id);
			break;
		}
	}

	// Stop playing on other clients
	if (isPlaying) return game.socket.emit(`module.${moduleName}`, { action: 'stopSoundbit', id: this.id });

	// Play soundbit
	const src = this.document.path;
	if (!src) return ui.notifications.warn('No sound source set.');

	const sound = (this.soundbit = new Sound(src));
	await sound.load();

	pauseMusic(this.document);
	let volume = this.document.getFlag(moduleName, 'global') ? this.document.volume : localVolume(this.document.object);

	// Change volume to exponential
	//volume = 2 ** (5 * volume - 5);

	sound.play({ volume });
	if (this.document.getFlag(moduleName, 'soundwaves')) createSoundWaves(this.document.object);

	sound.on('end', () => {
		this.soundbit = null;
		this.refresh();
		resumeMusic(this.document);
	});
	sound.id = this.id;

	// Play soundbit on other clients
	game.socket.emit(`module.${moduleName}`, { action: 'playSoundbit', src, id: this.id, volume: this.document.volume });

	// Update control icon texture
	this.controlIcon.texture = getTexture(`modules/${moduleName}/img/pause-circle-solid.svg`);
	this.controlIcon.draw();
}

const getFileName = (str) => {
	return decodeURI(str.split('\\').pop().split('/').pop().split('.')[0]);
};
