#compdef resumes ./resumes
# zsh completion for factloom's resumes launcher. Load it, after compinit, with:
#   source <(path/to/resumes completion zsh)
# or save the output as _resumes in a directory on your fpath. It asks the tool itself
# (`resumes __complete`), so commands, flags, people, variants, and themes are always the current
# repository's and nothing needs regenerating after an update. docs/completion.md.
_resumes() {
  local cmd=${words[1]/#\~/$HOME} out line value desc fallback=none ret=1
  local -a described
  out=$("$cmd" __complete "--cur=${words[CURRENT]}" -- "${(@)words[2,CURRENT-1]}" 2>/dev/null) || return 1
  # A real answer ends in a directive line; anything else (an older engine's help text, another program) is ignored.
  case ${out##*$'\n'} in :files | :dirs | :none) ;; *) return 1 ;; esac
  for line in "${(@f)out}"; do
    case $line in
      :files | :dirs | :none) fallback=${line#:} ;;
      "") ;;
      *)
        value=${line%%$'\t'*}
        desc=
        [[ $line == *$'\t'* ]] && desc=${line#*$'\t'}
        described+=("${value//:/\\:}${desc:+:$desc}")
        ;;
    esac
  done
  (( ${#described} )) && _describe 'resumes' described && ret=0
  [[ $fallback == files ]] && _files && ret=0
  [[ $fallback == dirs ]] && _files -/ && ret=0
  return ret
}
if [[ ${funcstack[1]} == _resumes ]]; then
  _resumes "$@"
elif (( $+functions[compdef] )); then
  compdef _resumes resumes ./resumes
else
  print -u2 "resumes completion: run compinit first (autoload -Uz compinit && compinit), then load this again"
fi
