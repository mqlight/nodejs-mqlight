{
    # <copyright
    # notice="lm-source-program"
    # pids="5725-P60"
    # years="2013,2014"
    # crc="3568777996" >
    # Licensed Materials - Property of IBM
    #
    # 5725-P60
    #
    # (C) Copyright IBM Corp. 2013, 2014
    #
    # US Government Users Restricted Rights - Use, duplication or
    # disclosure restricted by GSA ADP Schedule Contract with
    # IBM Corp.
    # </copyright>

    "targets": [{
        "target_name": "<(module_name)",
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
                "include_dirs+": [".", "<!(echo %BROOT%)/ship/mqm/include", "<!(echo %BROOT%)/appmsging/nodejs/node_modules/nan"],
                "libraries": ["<!(echo %QPIDLIB%)"],
            }],
            ["OS=='linux'", {
                "cflags_cc+": ["-Wall", "-Wno-comment", "-g"],
                "include_dirs+": [".", "<!(echo $BROOT)/ship/opt/mqm/include", "<!(echo $BROOT)/appmsging/nodejs/node_modules/nan"],
                "libraries": ["-lqpid-proton", "-L<!(echo $BROOT)/ship/opt/mqm/lib64", "-Wl,-rpath=\'$$ORIGIN\'"],
            }],
            ["OS=='mac'", {
                "cflags_cc+": ["-Wall", "-Wno-comment", "-g"],
                "include_dirs+": [".", "<!(echo $BROOT)/ship/opt/mqm/include", "<!(echo $BROOT)/appmsging/nodejs/node_modules/nan"],
                "libraries": ["-lqpid-proton", "-L<!(echo $BROOT)/ship/opt/mqm/lib64", "-Wl,-install_name,@rpath/proton.node", "-Wl,-rpath,@loader_path/", "-Wl,-headerpad_max_install_names"],
            }],
        ]
    },
    {
     "target_name": "action_after_build",
      "type": "none",
      "dependencies": [ "<(module_name)" ],
      "copies": [
        {
          "files": [ "<(PRODUCT_DIR)/<(module_name).node" ],
          "destination": "<(module_path)"
        }
     ]
    }]
}
