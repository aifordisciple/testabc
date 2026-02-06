nextflow.enable.dsl=2

// === 参数定义 (Default Values) ===
// 这些默认值会被 params.json 中的值覆盖
params.input = null
params.outdir = 'results'
params.skip_multiqc = false  // 👈 新增参数：默认不跳过
params.fastqc_args = ""      // 👈 新增参数：默认无额外参数

log.info """\
    R N A - S E Q   Q C
    ===================
    input       : ${params.input}
    outdir      : ${params.outdir}
    skip_multiqc: ${params.skip_multiqc}
    fastqc_args : "${params.fastqc_args}"
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
    container 'quay.io/biocontainers/fastqc:0.12.1--hdfd78af_0'

    input:
    tuple val(sample_id), path(reads)

    output:
    path "${sample_id}_logs", emit: fastqc_results

    script:
    """
    mkdir ${sample_id}_logs
    
    # 注入用户配置的参数 ${params.fastqc_args}
    fastqc ${params.fastqc_args} -o ${sample_id}_logs -q ${reads}
    """
}

// 3. MultiQC
process MULTIQC {
    publishDir "${params.outdir}/multiqc", mode: 'copy'
    container 'quay.io/biocontainers/multiqc:1.19--pyhdfd78af_0'

    input:
    path '*' 

    output:
    path "multiqc_report.html"
    path "multiqc_data"

    script:
    """
    multiqc .
    """
}

workflow {
    FASTQC(reads_ch)
    
    // 逻辑控制：如果用户没选 skip_multiqc，才运行 MultiQC
    if (!params.skip_multiqc) {
        MULTIQC(FASTQC.out.fastqc_results.collect())
    }
}