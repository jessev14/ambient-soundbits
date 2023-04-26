export async function createSoundWaves(ambientSound) {
	const sound = ambientSound.soundbit;

	const size = ambientSound.radius * 1.5;
	const duration = Math.max(2000, ambientSound.sound.duration * 1000);
	const rings = ~~(duration / 2000);
	const name = ambientSound.id;

	while (sound.playing && ambientSound.destroyed === false) {
		canvas.ping({ x: ambientSound.x, y: ambientSound.y }, { size, color: 0xffffff, duration, rings, name });
		await new Promise((resolve) => setTimeout(() => resolve(), duration));
	}
}
