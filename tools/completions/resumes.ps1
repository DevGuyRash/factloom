# PowerShell completion for factloom's resumes launcher (resumes.cmd on Windows, ./resumes elsewhere).
# Add this to your profile ($PROFILE):
#   & path\to\resumes.cmd completion powershell | Out-String | Invoke-Expression
# It asks the tool itself (`resumes __complete`), so commands, flags, people, variants, and themes are
# always the current repository's and nothing needs regenerating after an update. docs/completion.md.
Register-ArgumentCompleter -Native -CommandName 'resumes', 'resumes.cmd', './resumes', '.\resumes', '.\resumes.cmd' -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    $line = $commandAst.ToString()
    $cut = $cursorPosition - $commandAst.Extent.StartOffset
    if ($cut -lt $line.Length) { $line = $line.Substring(0, [Math]::Max(0, $cut)) }
    elseif ($cut -gt $line.Length) { $line += ' ' }
    # Words typed so far; after a space the split ends in an empty word, the one under the cursor.
    $parts = @($line -split '\s+')
    $program = $parts[0]
    $current = $parts[$parts.Count - 1]
    $earlier = @()
    if ($parts.Count -gt 2) { $earlier = $parts[1..($parts.Count - 2)] }
    $output = @(& $program __complete "--cur=$current" -- @earlier 2>$null)
    # A real answer ends in a directive line; anything else (an older engine's help text, another program) is ignored.
    if ($output.Count -eq 0 -or $output[$output.Count - 1] -notmatch '^:(none|files|dirs)$') { return }
    foreach ($entry in $output) {
        if ($entry -match '^:(none|files|dirs)$') { continue }
        $value, $description = $entry -split "`t", 2
        if (-not $description) { $description = $value }
        [System.Management.Automation.CompletionResult]::new($value, $value, 'ParameterValue', $description)
    }
}
