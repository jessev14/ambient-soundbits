let processorRegistered = false;

async function registerLoudnessProcessor() {
	if (processorRegistered === true) return true;
	if (game.audio.context === null) return false;
	await game.audio.context.audioWorklet.addModule('modules/ambient-soundbits/lib/loudness-normalization-processor.js');
	return (processorRegistered = true);
}

function getAverageLoudness(audioBufferSourceNode) {
	const buffer = audioBufferSourceNode.buffer;
	const bufferLength = buffer.length;
	const channelData = buffer.getChannelData(0);
	const sampleRate = buffer.sampleRate;
	const numSamples = channelData.length;
	const duration = numSamples / sampleRate;
	const frameSize = 4096;
	const numFrames = Math.ceil(bufferLength / frameSize);
	let sum = 0;

	for (let i = 0; i < numFrames; i++) {
		const start = i * frameSize;
		const end = Math.min(start + frameSize, bufferLength);
		let rms = 0;

		for (let j = start; j < end; j++) {
			rms += channelData[j] * channelData[j];
		}

		rms = Math.sqrt(rms / (end - start));
		sum += 20 * Math.log10(rms);
	}

	const dBFS = sum / numFrames;
	const LUFS = -0.691 + dBFS - 10 * Math.log10(duration) - 14;

	return LUFS;
}

export async function normalizeAudio(sound) {
	// Register the Loudness Normalization Processor
	await registerLoudnessProcessor();

	// Creates the Audio Worklet
	const audioContext = sound.context;
	const loudnessNormalizationNode = new AudioWorkletNode(audioContext, 'loudness-normalizer');
	sound.node.connect(loudnessNormalizationNode);
	loudnessNormalizationNode.connect(audioContext.destination);
	loudnessNormalizationNode.port.postMessage({ type: 'loudness', loudness: getAverageLoudness(sound.node) });

	sound.on('end', () => {
		// Disconnect the AudioWorkletNode from the audio graph once hte Sound finishes
		loudnessNormalizationNode.disconnect();
	});
}
