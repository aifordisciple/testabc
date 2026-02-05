nextflow.enable.dsl=2

params.input = null
params.outdir = 'results'

log.info """\
    R N A - S E Q   Q C
    ===================
    input : ${params.input}
    outdir: ${params.outdir}
    """

// 1. 解析 CSV 输入
Channel
    .fromPath(params.input)
    .splitCsv(header:true)
    .map { row -> 
        // 兼容单端(SE)和双端(PE)
        def reads = row.r2_path ? [file(row.r1_path), file(row.r2_path)] : [file(row.r1_path)]
        return tuple(row.sample_id, reads) 
    }
    .set { reads_ch }

// 2. FastQC
process FASTQC {
    tag "$sample_id"
    publishDir "${params.outdir}/fastqc", mode: 'copy'
    // 使用 Biocontainers 镜像
    container 'quay.io/biocontainers/fastqc:0.12.1--hdfd78af_0'

    input:
    tuple val(sample_id), path(reads)

    output:
    path "*_fastqc.{zip,html}", emit: fastqc_results

    script:
    """
    fastqc -q ${reads}
    """
}

// 3. MultiQC
process MULTIQC {
    publishDir "${params.outdir}/multiqc", mode: 'copy'
    container 'quay.io/biocontainers/multiqc:1.19--pyhdfd78af_0'

    input:
    path '*' // 收集所有 FastQC 输出

    output:
    path "multiqc_report.html"

    script:
    """
    multiqc .
    """
}

workflow {
    FASTQC(reads_ch)
    MULTIQC(FASTQC.out.fastqc_results.collect())
}