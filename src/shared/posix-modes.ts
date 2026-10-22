/**
 * Whether a file's mode bits and owner mean anything here. Windows reports mode 0666 for every file it can write and
 * no owner: NTFS ACLs, not mode bits, keep a profile's files private, so a mode check there would refuse every file.
 */
export const POSIX_MODES = process.platform !== 'win32';
