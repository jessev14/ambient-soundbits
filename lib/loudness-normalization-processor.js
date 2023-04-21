const LOUDNESS = -14; // In Loudness Units Full Scale (LUFS)

class LoudnessNormalizationProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		this.loudness = null;
		this.port.onmessage = (event) => {
			if (event.data.type === 'loudness') {
				this.loudness = event.data.loudness;
			}
		};
	}

	process(inputs, outputs) {
		if (this.loudness !== null) {
			const currentLoudness = this.loudness;
			const gain = Math.pow(10, (LOUDNESS - currentLoudness) / 20);
			const input = inputs[0];
			const output = outputs[0];
			if (input.length === 0) return false;
			for (let channel = 0; channel < output.length; channel++) {
				for (let i = 0; i < output[channel].length; i++) {
					output[channel][i] = input[channel][i] * gain;
				}
			}
		}
		return true;
	}
}

registerProcessor('loudness-normalizer', LoudnessNormalizationProcessor);
