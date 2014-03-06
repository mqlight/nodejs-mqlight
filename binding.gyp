{
    "targets": [{
        "target_name": "proton",
        "type": "loadable_module",
        "sources": ["messenger.cpp", "message.cpp", "proton.cpp"],
        "conditions": [
            ["OS=='win'", {
                "cflags_cc+": ["/W3", "/Zi"],
                'msvs_settings': {
                  'VCCLCompilerTool': {
                    'AdditionalOptions': [ '/EHsc' ],
                    'ShowIncludes': 'false',
                    'PreprocessorDefinitions': [ '_WIN32_WINNT=0x0600', 'PN_NODEFINE_SSIZE_T' ]
                  }
                },
                "include_dirs+": [".", "<!(echo %BROOT%)/thirdpartyproducts/qpid-proton/include"],
                "libraries": ["<!(echo %BROOT%)/thirdpartyproducts/qpid-proton/qpid-proton.lib"],
            }],
            ["OS=='linux'", {
                "cflags_cc+": ["-Wall", "-Wno-comment", "-g"],
                "include_dirs+": [".", "<!(echo $BROOT)/ship/opt/mqm/include"],
                "libraries": ["-lqpid-proton", "-L<!(echo $BROOT)/ship/opt/mqm/lib64", "-Wl,-rpath=\'$$ORIGIN\'"],
            }],
            ["OS=='mac'", {
                "cflags_cc+": ["-Wall", "-Wno-comment", "-g"],
                "include_dirs+": [".", "<!(echo $BROOT)/ship/opt/mqm/include"],
                "libraries": ["-lqpid-proton", "-L<!(echo $BROOT)/ship/opt/mqm/lib64", "-Wl,-install_name,@rpath/proton.node", "-Wl,-rpath,@loader_path/", "-Wl,-headerpad_max_install_names"],
            }],
        ]
    }]
}
