# Encoding Policy

This project uses UTF-8 for all source, configuration, script, and documentation files.

## Editor Rules

VS Code must open and save files as UTF-8. The workspace settings pin `files.encoding` to `utf8`, disable automatic encoding guessing, and use LF line endings.

## PowerShell Rules

When reading text files in PowerShell, prefer:

```powershell
Get-Content -Encoding UTF8
```

When writing text files in PowerShell, always specify UTF-8 explicitly:

```powershell
Set-Content -Encoding UTF8
Add-Content -Encoding UTF8
Out-File -Encoding UTF8
```

Avoid `>` and `>>` for important source, configuration, or documentation files. Use the explicit cmdlets above instead.

## Message Placement

Do not put large Chinese strings in service-layer, database-layer, or AI-call-layer exceptions. Prefer English errors or stable error codes such as `TUTOR_SERVICE_GENERATION_FAILED`.

User-visible Chinese copy should live in the frontend copy layer or an i18n file, where encoding and review are easier to control.

## If Mojibake Appears

If characters such as `U+9420`, `U+95BA`, `U+923B`, `U+93B9`, or `U+FFFD` appear as mojibake or replacement characters again, stop editing and run:

```bash
npm run encoding:check
```

Fix the corrupted file before continuing.
