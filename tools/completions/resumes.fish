# fish completion for factloom's resumes launcher. Install it with:
#   path/to/resumes completion fish > ~/.config/fish/completions/resumes.fish
# It asks the tool itself (`resumes __complete`), so commands, flags, people, variants, and themes are
# always the current repository's and nothing needs regenerating after an update. docs/completion.md.
function __resumes_complete
    set -l tokens (commandline -opc)
    set -l cur (commandline -ct)
    set -l cmd $tokens[1]
    set -e tokens[1]
    set -l fallback none
    for line in ($cmd __complete "--cur=$cur" -- $tokens 2>/dev/null)
        switch $line
            case ':files' ':dirs' ':none'
                set fallback (string sub -s 2 -- $line)
            case '*'
                printf '%s\n' $line
        end
    end
    switch $fallback
        case files
            __fish_complete_path "$cur"
        case dirs
            __fish_complete_directories "$cur"
    end
end

complete -c resumes -f -a '(__resumes_complete)'
complete -c ./resumes -f -a '(__resumes_complete)'
