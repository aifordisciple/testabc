// backend/pipelines/simple_demo/main.nf

nextflow.enable.dsl=2

params.input = null  
params.outdir = 'results' 

log.info """\
    SIMPLE DEMO PIPELINE
    ====================
    input   : ${params.input}
    outdir  : ${params.outdir}
    """

Channel
    .fromPath(params.input)
    .splitCsv(header:true)
    .map { row -> tuple(row.sample_id, row.r1_path) } 
    .set { reads_ch }

process SAY_HELLO {
    tag "$sample_id"
    publishDir params.outdir, mode: 'copy'
    
    // 这里虽然定义了，但配合 config 里的全局定义更稳妥
    container 'ubuntu:latest'

    input:
    tuple val(sample_id), val(r1_path)

    output:
    path "${sample_id}.log"

    script:
    """
    echo "Processing sample: ${sample_id}" > ${sample_id}.log
    echo "Simulating analysis on file: ${r1_path}" >> ${sample_id}.log
    echo "Running inside Docker container!" >> ${sample_id}.log
    date >> ${sample_id}.log
    """
}

workflow {
    SAY_HELLO(reads_ch)
}