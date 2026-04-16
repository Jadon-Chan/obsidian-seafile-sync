const TAG = "[seafile-sync]";

export const log = {
	debug: (...a: unknown[]) => console.debug(TAG, ...a),
	info: (...a: unknown[]) => console.log(TAG, ...a),
	warn: (...a: unknown[]) => console.warn(TAG, ...a),
	error: (...a: unknown[]) => console.error(TAG, ...a),
};
