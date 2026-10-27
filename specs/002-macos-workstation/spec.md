# Windows and macOS one-command setup

The existing Windows README command and installer stay unchanged. macOS receives a separate one-command Terminal entry point and implementation for managed editor settings, rules, skills, extensions, and pinned font. User settings, credentials, and unrelated files are backed up or preserved. The Mac installer must reject unsupported operating systems and an unavailable IDE before modifying the profile. Native database preferences remain untouched until a macOS IDE build is audited.

Acceptance: platform path and settings tests, shell syntax check, existing Windows suite, and a real macOS install/Doctor run before declaring live support.
