// The ML deps only exist after `bun run ml:install`, and an ambient declaration wins
// over resolution, so the worker typechecks the same with or without them.
declare module '@huggingface/transformers';
declare module 'sharp';
