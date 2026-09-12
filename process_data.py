import openpyxl
import pandas as pd
import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
import json
import os
import sys

def read_sheet_fast(wb, sheet_name):
    sheet = wb[sheet_name]
    data = []
    headers = None
    for i, row in enumerate(sheet.iter_rows(values_only=True)):
        if i == 0:
            headers = [str(c) if c is not None else f"col_{idx}" for idx, c in enumerate(row)]
        else:
            data.append(row)
    return pd.DataFrame(data, columns=headers)

def main():
    print("Carregando workbook em modo read_only...", flush=True)
    excel_file = "Cópia de VLimp - Base de Dados.xlsx"
    wb = openpyxl.load_workbook(excel_file, read_only=True, data_only=True)
    
    print("Extraindo sheets...", flush=True)
    df_clientes = read_sheet_fast(wb, "clientes")
    print(f"Clientes lidos: {len(df_clientes)}", flush=True)
    df_produtos = read_sheet_fast(wb, "produtos")
    print(f"Produtos lidos: {len(df_produtos)}", flush=True)
    df_vendedores = read_sheet_fast(wb, "vendedores")
    print(f"Vendedores lidos: {len(df_vendedores)}", flush=True)
    df_vendas = read_sheet_fast(wb, "vendas_item")
    print(f"Vendas lidas: {len(df_vendas)}", flush=True)
    df_visitas = read_sheet_fast(wb, "visitas")
    print(f"Visitas lidas: {len(df_visitas)}", flush=True)
    df_potencial = read_sheet_fast(wb, "potencial_mercado")
    df_calendario = read_sheet_fast(wb, "calendario_comercial")
    df_distancias = read_sheet_fast(wb, "distancias")
    wb.close()

    # Converter colunas numéricas
    for c in ['n_checkouts', 'area_loja_m2']:
        df_clientes[c] = pd.to_numeric(df_clientes[c], errors='coerce')

    for c in ['preco_lista', 'custo_unitario']:
        df_produtos[c] = pd.to_numeric(df_produtos[c], errors='coerce')

    for c in ['capacidade_visitas_mes', 'custo_mensal_total', 'meta_receita_mensal', 'meta_margem_pct']:
        df_vendedores[c] = pd.to_numeric(df_vendedores[c], errors='coerce')

    for c in ['quantidade', 'volume_kg', 'receita_bruta', 'desconto', 'receita_liquida', 'custo_total', 'margem_contribuicao']:
        df_vendas[c] = pd.to_numeric(df_vendas[c], errors='coerce')

    for c in ['duracao_min']:
        df_visitas[c] = pd.to_numeric(df_visitas[c], errors='coerce')

    for c in ['mercado_estimado_mensal', 'crescimento_categoria_pct', 'share_categoria_canal_pct', 'distribuicao_numerica_pct', 'indice_consumo']:
        df_potencial[c] = pd.to_numeric(df_potencial[c], errors='coerce')

    print("Processando faturamento e KPIs...", flush=True)
    df_faturado = df_vendas[df_vendas['status_pedido'] == 'Faturado'].copy()
    df_faturado_prod = df_faturado.merge(df_produtos[['sku_id', 'categoria', 'subcategoria', 'marca', 'preco_lista', 'custo_unitario']], on='sku_id', how='left')

    # Métricas por Cliente
    vendas_cli = df_faturado.groupby('cliente_id').agg(
        receita_bruta=('receita_bruta', 'sum'),
        receita_liquida=('receita_liquida', 'sum'),
        desconto_total=('desconto', 'sum'),
        custo_total=('custo_total', 'sum'),
        margem_total=('margem_contribuicao', 'sum'),
        total_pedidos=('pedido_id', 'nunique'),
        total_itens=('quantidade', 'sum'),
        volume_total_kg=('volume_kg', 'sum'),
        primeira_compra=('data_pedido', 'min'),
        ultima_compra=('data_pedido', 'max'),
        skus_unicos=('sku_id', 'nunique')
    ).reset_index()

    cat_cli = df_faturado_prod.groupby('cliente_id')['categoria'].nunique().reset_index().rename(columns={'categoria': 'categorias_unicas'})
    vendas_cli = vendas_cli.merge(cat_cli, on='cliente_id', how='left')

    visitas_cli = df_visitas.groupby('cliente_id').agg(
        total_visitas=('visita_id', 'count'),
        duracao_media_visita=('duracao_min', 'mean'),
        visitas_planejadas=('tipo_visita', lambda x: (x == 'Planejada').sum()),
        visitas_extra=('tipo_visita', lambda x: (x == 'Extra-rota').sum()),
        visitas_com_pedido=('resultado_visita', lambda x: (x == 'Pedido').sum()),
        ultima_visita=('data_visita', 'max')
    ).reset_index()
    visitas_cli['taxa_conversao_visitas'] = visitas_cli['visitas_com_pedido'] / visitas_cli['total_visitas'].replace(0, 1)

    cli_full = df_clientes.merge(vendas_cli, on='cliente_id', how='left')
    cli_full = cli_full.merge(visitas_cli, on='cliente_id', how='left')

    numeric_cols = ['receita_bruta', 'receita_liquida', 'desconto_total', 'custo_total', 'margem_total',
                    'total_pedidos', 'total_itens', 'volume_total_kg', 'skus_unicos', 'categorias_unicas',
                    'total_visitas', 'duracao_media_visita', 'visitas_planejadas', 'visitas_extra',
                    'visitas_com_pedido', 'taxa_conversao_visitas']
    for c in numeric_cols:
        cli_full[c] = cli_full[c].fillna(0)

    cli_full['margem_pct'] = np.where(cli_full['receita_liquida'] > 0, cli_full['margem_total'] / cli_full['receita_liquida'], 0)
    cli_full['desconto_pct'] = np.where(cli_full['receita_bruta'] > 0, cli_full['desconto_total'] / cli_full['receita_bruta'], 0)
    cli_full['ticket_medio'] = np.where(cli_full['total_pedidos'] > 0, cli_full['receita_liquida'] / cli_full['total_pedidos'], 0)
    
    ref_date = pd.to_datetime('2025-12-31')
    cli_full['ultima_compra_dt'] = pd.to_datetime(cli_full['ultima_compra'])
    cli_full['recencia_dias'] = (ref_date - cli_full['ultima_compra_dt']).dt.days.fillna(999)

    df_faturado['ano'] = pd.to_datetime(df_faturado['data_pedido']).dt.year
    vendas_ano = df_faturado.groupby(['cliente_id', 'ano'])['receita_liquida'].sum().unstack(fill_value=0).reset_index()
    vendas_ano.columns = ['cliente_id', 'receita_2024', 'receita_2025']
    cli_full = cli_full.merge(vendas_ano, on='cliente_id', how='left').fillna({'receita_2024': 0, 'receita_2025': 0})
    cli_full['crescimento_yoy'] = np.where(cli_full['receita_2024'] > 0, (cli_full['receita_2025'] - cli_full['receita_2024']) / cli_full['receita_2024'], np.where(cli_full['receita_2025'] > 0, 1.0, 0.0))

    pot_cid = df_potencial.groupby(['cidade', 'canal'])['mercado_estimado_mensal'].sum().reset_index().rename(columns={'mercado_estimado_mensal': 'potencial_mercado_cidade_canal_mensal'})
    cli_full = cli_full.merge(pot_cid, on=['cidade', 'canal'], how='left').fillna({'potencial_mercado_cidade_canal_mensal': 0})

    print("Executando K-Means Clustering...", flush=True)
    features = pd.DataFrame()
    features['log_receita'] = np.log1p(cli_full['receita_liquida'])
    features['frequencia'] = cli_full['total_pedidos']
    features['recencia'] = cli_full['recencia_dias']
    features['margem_pct'] = cli_full['margem_pct']
    features['desconto_pct'] = cli_full['desconto_pct']
    features['mix_skus'] = cli_full['skus_unicos']
    features['ticket_medio_log'] = np.log1p(cli_full['ticket_medio'])
    features['checkouts'] = cli_full['n_checkouts'].fillna(1)
    features['area_loja'] = cli_full['area_loja_m2'].fillna(30)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(features)

    kmeans = KMeans(n_clusters=5, random_state=42, n_init=20)
    clusters = kmeans.fit_predict(X_scaled)
    cli_full['cluster_raw'] = clusters

    pca = PCA(n_components=2, random_state=42)
    coords_2d = pca.fit_transform(X_scaled)
    cli_full['pca_x'] = np.round(coords_2d[:, 0], 3)
    cli_full['pca_y'] = np.round(coords_2d[:, 1], 3)

    cluster_stats = cli_full.groupby('cluster_raw').agg(
        n=('cliente_id', 'count'),
        rec_liq_med=('receita_liquida', 'mean'),
        rec_liq_sum=('receita_liquida', 'sum'),
        pedidos_med=('total_pedidos', 'mean'),
        recencia_med=('recencia_dias', 'mean'),
        margem_pct_med=('margem_pct', 'mean'),
        desconto_pct_med=('desconto_pct', 'mean'),
        skus_med=('skus_unicos', 'mean'),
        checkouts_med=('n_checkouts', 'mean'),
        area_med=('area_loja_m2', 'mean'),
        conversao_visitas_med=('taxa_conversao_visitas', 'mean')
    ).reset_index()

    print("Estatísticas dos clusters gerados:")
    print(cluster_stats)

    # Identificar papéis de negócio dos 5 clusters
    # 1. Cluster com maior receita média -> Key Accounts / Campeões
    # 2. Cluster com maior recência média (> 150 dias) ou menor frequência -> Em Risco / Churn
    # 3. Cluster com maior porte físico (checkouts/área) e receita moderada -> Alto Potencial Inexplorado
    # 4. Cluster com maior desconto / menor margem -> Sensíveis a Preço / Margem Apertada
    # 5. Demais -> Pequeno Varejo / Frequentes Estáveis

    sorted_by_rec = cluster_stats.sort_values(by='rec_liq_med', ascending=False)['cluster_raw'].tolist()
    sorted_by_recencia = cluster_stats.sort_values(by='recencia_med', ascending=False)['cluster_raw'].tolist()
    sorted_by_porte = cluster_stats.sort_values(by='checkouts_med', ascending=False)['cluster_raw'].tolist()
    sorted_by_desc = cluster_stats.sort_values(by='desconto_pct_med', ascending=False)['cluster_raw'].tolist()

    key_acc_id = sorted_by_rec[0]
    churn_id = [c for c in sorted_by_recencia if c != key_acc_id][0]
    high_pot_id = [c for c in sorted_by_porte if c not in (key_acc_id, churn_id)][0]
    disc_id = [c for c in sorted_by_desc if c not in (key_acc_id, churn_id, high_pot_id)][0]
    stable_id = [c for c in cluster_stats['cluster_raw'] if c not in (key_acc_id, churn_id, high_pot_id, disc_id)][0]

    cluster_mapping = {
        int(key_acc_id): {
            'nome': "Key Accounts / Campeões",
            'code': "C1_KEY_ACCOUNTS",
            'color': "#10b981", # Verde Esmeralda
            'desc': "Grandes clientes com alto faturamento, alta frequência e ampla cesta de produtos. Geradores chave de margem da Vlimp.",
            'tag': "Diamante"
        },
        int(high_pot_id): {
            'nome': "Alto Potencial Inexplorado",
            'code': "C2_HIGH_POTENTIAL",
            'color': "#3b82f6", # Azul Elétrico
            'desc': "PDVs com estrutura física relevante (checkouts/área) e alto mercado local, mas subpenetrados no portfólio Vlimp. Meta principal de cross-sell.",
            'tag': "Oportunidade"
        },
        int(churn_id): {
            'nome': "Em Risco / Churn",
            'code': "C3_CHURN_RISK",
            'color': "#ef4444", # Vermelho Coral
            'desc': "Clientes com longa inatividade ou acentuada queda de pedidos em 2025. Necessitam de plano urgente de reativação.",
            'tag': "Risco Alto"
        },
        int(disc_id): {
            'nome': "Sensíveis a Preço / Margem Apertada",
            'code': "C4_DISCOUNT_HUNTERS",
            'color': "#f59e0b", # Âmbar
            'desc': "Clientes com alta dependência de descontos promocionais, operando em margens abaixo da média corporativa.",
            'tag': "Atenção Margem"
        },
        int(stable_id): {
            'nome': "Pequeno Varejo / Frequentes Estáveis",
            'code': "C5_RETAIL_STABLE",
            'color': "#8b5cf6", # Roxo / Violeta
            'desc': "Varejo tradicional de vizinhança. Compras regulares de itens essenciais (Cloro/Detergente), com margem saudável e alta fidelidade.",
            'tag': "Base Recorrente"
        }
    }

    cli_full['cluster_nome'] = cli_full['cluster_raw'].apply(lambda c: cluster_mapping[c]['nome'])
    cli_full['cluster_code'] = cli_full['cluster_raw'].apply(lambda c: cluster_mapping[c]['code'])
    cli_full['cluster_color'] = cli_full['cluster_raw'].apply(lambda c: cluster_mapping[c]['color'])
    cli_full['cluster_tag'] = cli_full['cluster_raw'].apply(lambda c: cluster_mapping[c]['tag'])

    # Vendedores
    print("Processando vendedores...", flush=True)
    vendas_vend = df_faturado.groupby('vendedor_id').agg(
        receita_total=('receita_liquida', 'sum'),
        margem_total=('margem_contribuicao', 'sum'),
        pedidos_total=('pedido_id', 'nunique'),
        itens_total=('quantidade', 'sum'),
        clientes_atendidos=('cliente_id', 'nunique'),
        desconto_total=('desconto', 'sum'),
        receita_bruta=('receita_bruta', 'sum')
    ).reset_index()

    visitas_vend = df_visitas.groupby('vendedor_id').agg(
        total_visitas=('visita_id', 'count'),
        visitas_com_pedido=('resultado_visita', lambda x: (x == 'Pedido').sum()),
        duracao_media=('duracao_min', 'mean'),
        checkin_ok_pct=('checkin_ok', lambda x: (x == 'Sim').mean())
    ).reset_index()
    visitas_vend['conversao_visitas_pct'] = visitas_vend['visitas_com_pedido'] / visitas_vend['total_visitas'].replace(0, 1)

    vend_full = df_vendedores.merge(vendas_vend, on='vendedor_id', how='left')
    vend_full = vend_full.merge(visitas_vend, on='vendedor_id', how='left').fillna(0)
    
    vend_full['meta_receita_periodo'] = vend_full['meta_receita_mensal'] * 24
    vend_full['atingimento_receita_pct'] = vend_full['receita_total'] / vend_full['meta_receita_periodo']
    vend_full['margem_realizada_pct'] = np.where(vend_full['receita_total'] > 0, vend_full['margem_total'] / vend_full['receita_total'], 0)
    vend_full['atingimento_margem_pct'] = vend_full['margem_realizada_pct'] / vend_full['meta_margem_pct']
    vend_full['desconto_medio_pct'] = np.where(vend_full['receita_bruta'] > 0, vend_full['desconto_total'] / vend_full['receita_bruta'], 0)
    vend_full['visitas_mes_realizadas'] = vend_full['total_visitas'] / 24
    vend_full['aproveitamento_capacidade_visitas'] = vend_full['visitas_mes_realizadas'] / vend_full['capacidade_visitas_mes']

    def map_vend_quadrant(row):
        if row['atingimento_receita_pct'] >= 1.0 and row['margem_realizada_pct'] >= row['meta_margem_pct']:
            return "Alta Performance (Estrela)"
        elif row['atingimento_receita_pct'] >= 1.0 and row['margem_realizada_pct'] < row['meta_margem_pct']:
            return "Volume com Baixa Margem"
        elif row['atingimento_receita_pct'] < 1.0 and row['margem_realizada_pct'] >= row['meta_margem_pct']:
            return "Rentável com Baixo Volume"
        else:
            return "Abaixo da Meta (Crítico)"

    vend_full['perfil_vendedor'] = vend_full.apply(map_vend_quadrant, axis=1)

    # Processar SKUs
    print("Processando produtos e SKUs...", flush=True)
    vendas_sku = df_faturado.groupby('sku_id').agg(
        receita_total=('receita_liquida', 'sum'),
        quantidade_total=('quantidade', 'sum'),
        volume_kg_total=('volume_kg', 'sum'),
        margem_total=('margem_contribuicao', 'sum'),
        desconto_total=('desconto', 'sum'),
        pedidos_total=('pedido_id', 'nunique'),
        clientes_atendidos=('cliente_id', 'nunique')
    ).reset_index()

    sku_full = df_produtos.merge(vendas_sku, on='sku_id', how='left').fillna(0)
    sku_full['margem_pct'] = np.where(sku_full['receita_total'] > 0, sku_full['margem_total'] / sku_full['receita_total'], 0)
    sku_full['desconto_medio_pct'] = np.where((sku_full['receita_total'] + sku_full['desconto_total']) > 0, sku_full['desconto_total'] / (sku_full['receita_total'] + sku_full['desconto_total']), 0)
    sku_full['ticket_medio_item'] = np.where(sku_full['pedidos_total'] > 0, sku_full['receita_total'] / sku_full['pedidos_total'], 0)

    # Curva ABC
    sku_full = sku_full.sort_values(by='receita_total', ascending=False)
    sku_full['receita_cum'] = sku_full['receita_total'].cumsum()
    total_sku_rec = sku_full['receita_total'].sum()
    sku_full['receita_cum_pct'] = sku_full['receita_cum'] / total_sku_rec
    sku_full['curva_abc'] = np.where(sku_full['receita_cum_pct'] <= 0.70, 'A (Top 70%)', np.where(sku_full['receita_cum_pct'] <= 0.90, 'B (Próximos 20%)', 'C (Cauda Longa 10%)'))

    # Matriz Categoria & Cross-Sell
    print("Calculando matriz de co-ocorrência...", flush=True)
    ped_cat = df_faturado_prod.groupby(['pedido_id', 'categoria']).size().unstack(fill_value=0)
    ped_cat_binary = (ped_cat > 0).astype(int)
    co_matrix = ped_cat_binary.T.dot(ped_cat_binary)
    total_peds_by_cat = ped_cat_binary.sum(axis=0)
    co_matrix_pct = co_matrix.div(total_peds_by_cat, axis=0)

    # Padrões Temporais
    vendas_mes_total = df_faturado.groupby('mes_ref').agg(
        receita_liquida=('receita_liquida', 'sum'),
        receita_bruta=('receita_bruta', 'sum'),
        desconto=('desconto', 'sum'),
        custo_total=('custo_total', 'sum'),
        margem_contribuicao=('margem_contribuicao', 'sum'),
        pedidos=('pedido_id', 'nunique'),
        clientes_ativos=('cliente_id', 'nunique')
    ).reset_index()
    vendas_mes_total['margem_pct'] = vendas_mes_total['margem_contribuicao'] / vendas_mes_total['receita_liquida']
    vendas_mes_total['desconto_pct'] = vendas_mes_total['desconto'] / vendas_mes_total['receita_bruta']

    # Eficiência de Visitas
    df_visitas['duracao_faixa'] = pd.cut(df_visitas['duracao_min'], bins=[0, 15, 30, 45, 60, 90, 180], labels=['0-15 min', '16-30 min', '31-45 min', '46-60 min', '61-90 min', '90+ min'])
    visitas_padrao = df_visitas.groupby(['duracao_faixa', 'tipo_visita'], observed=False).agg(
        total=('visita_id', 'count'),
        com_pedido=('resultado_visita', lambda x: (x == 'Pedido').sum())
    ).reset_index()
    visitas_padrao['taxa_conversao'] = visitas_padrao['com_pedido'] / visitas_padrao['total'].replace(0, 1)

    # Desconto vs Margem
    df_faturado['faixa_desconto'] = pd.cut(
        np.where(df_faturado['receita_bruta'] > 0, df_faturado['desconto'] / df_faturado['receita_bruta'], 0),
        bins=[-0.01, 0.0, 0.03, 0.06, 0.10, 0.15, 0.25, 1.0],
        labels=['0% (Sem desconto)', '0.1% a 3%', '3.1% a 6%', '6.1% a 10%', '10.1% a 15%', '15.1% a 25%', '> 25%']
    )
    desconto_margem = df_faturado.groupby('faixa_desconto', observed=False).agg(
        total_itens=('pedido_id', 'count'),
        receita_liquida=('receita_liquida', 'sum'),
        desconto_total=('desconto', 'sum'),
        margem_total=('margem_contribuicao', 'sum')
    ).reset_index()
    desconto_margem['margem_pct'] = np.where(desconto_margem['receita_liquida'] > 0, desconto_margem['margem_total'] / desconto_margem['receita_liquida'], 0)

    # Análise Geográfica
    geo_vendas = df_faturado.merge(df_clientes[['cliente_id', 'uf', 'regiao_comercial', 'cidade', 'canal']], on='cliente_id', how='left')
    geo_uf = geo_vendas.groupby(['uf', 'regiao_comercial']).agg(
        receita_liquida=('receita_liquida', 'sum'),
        margem_contribuicao=('margem_contribuicao', 'sum'),
        clientes_atendidos=('cliente_id', 'nunique'),
        pedidos_total=('pedido_id', 'nunique')
    ).reset_index()
    geo_uf['margem_pct'] = geo_uf['margem_contribuicao'] / geo_uf['receita_liquida']

    pot_uf = df_potencial.groupby('uf')['mercado_estimado_mensal'].sum().reset_index()
    pot_uf['potencial_total_24m'] = pot_uf['mercado_estimado_mensal'] * 24
    geo_uf = geo_uf.merge(pot_uf[['uf', 'potencial_total_24m']], on='uf', how='left').fillna({'potencial_total_24m': 0})
    geo_uf['share_vlimp_pct'] = np.where(geo_uf['potencial_total_24m'] > 0, geo_uf['receita_liquida'] / geo_uf['potencial_total_24m'], 0)

    print("Construindo listas e mapas micro...", flush=True)

    clientes_micro = []
    for _, r in cli_full.iterrows():
        clientes_micro.append({
            'id': str(r['cliente_id']),
            'nome': str(r['nome_cliente_ficticio']),
            'canal': str(r['canal']),
            'porte': str(r['porte']),
            'cidade': str(r['cidade']),
            'uf': str(r['uf']),
            'regiao': str(r['regiao_comercial']),
            'vendedor_id': str(r['vendedor_id']),
            'checkouts': int(r['n_checkouts']) if pd.notnull(r['n_checkouts']) else 0,
            'area_m2': int(r['area_loja_m2']) if pd.notnull(r['area_loja_m2']) else 0,
            'faixa_fat': str(r['faixa_faturamento_pdv']),
            'data_cad': str(r['data_cadastro'])[:10] if pd.notnull(r['data_cadastro']) else '',
            'status': str(r['status_cliente']),
            'cluster_raw': int(r['cluster_raw']),
            'cluster_nome': str(r['cluster_nome']),
            'cluster_code': str(r['cluster_code']),
            'cluster_color': str(r['cluster_color']),
            'cluster_tag': str(r['cluster_tag']),
            'x': float(r['pca_x']),
            'y': float(r['pca_y']),
            'rec_bruta': round(float(r['receita_bruta']), 2),
            'rec_liq': round(float(r['receita_liquida']), 2),
            'margem': round(float(r['margem_total']), 2),
            'margem_pct': round(float(r['margem_pct']) * 100, 2),
            'desconto': round(float(r['desconto_total']), 2),
            'desconto_pct': round(float(r['desconto_pct']) * 100, 2),
            'pedidos': int(r['total_pedidos']),
            'itens': int(r['total_itens']),
            'volume_kg': round(float(r['volume_total_kg']), 1),
            'ticket_medio': round(float(r['ticket_medio']), 2),
            'skus': int(r['skus_unicos']),
            'categorias': int(r['categorias_unicas']),
            'recencia_dias': int(r['recencia_dias']),
            'primeira_compra': str(r['primeira_compra'])[:10] if pd.notnull(r['primeira_compra']) else '',
            'ultima_compra': str(r['ultima_compra'])[:10] if pd.notnull(r['ultima_compra']) else '',
            'visitas': int(r['total_visitas']),
            'visitas_pedidos': int(r['visitas_com_pedido']),
            'conv_visitas': round(float(r['taxa_conversao_visitas']) * 100, 1),
            'rec_2024': round(float(r['receita_2024']), 2),
            'rec_2025': round(float(r['receita_2025']), 2),
            'cresc_yoy': round(float(r['crescimento_yoy']) * 100, 1),
            'potencial_cidade': round(float(r['potencial_mercado_cidade_canal_mensal']), 2)
        })

    clusters_resumo = []
    for c_id, info in cluster_mapping.items():
        subset = cli_full[cli_full['cluster_raw'] == c_id]
        clusters_resumo.append({
            'cluster_raw': int(c_id),
            'nome': info['nome'],
            'code': info['code'],
            'color': info['color'],
            'desc': info['desc'],
            'tag': info['tag'],
            'total_clientes': len(subset),
            'pct_clientes': round(len(subset) / len(cli_full) * 100, 1),
            'rec_total': round(float(subset['receita_liquida'].sum()), 2),
            'pct_receita': round(float(subset['receita_liquida'].sum()) / float(cli_full['receita_liquida'].sum()) * 100, 1),
            'margem_total': round(float(subset['margem_total'].sum()), 2),
            'margem_pct_med': round(float(subset['margem_pct'].mean()) * 100, 2),
            'desconto_pct_med': round(float(subset['desconto_pct'].mean()) * 100, 2),
            'rec_med': round(float(subset['receita_liquida'].mean()), 2),
            'pedidos_med': round(float(subset['total_pedidos'].mean()), 1),
            'ticket_med': round(float(subset['ticket_medio'].mean()), 2),
            'skus_med': round(float(subset['skus_unicos'].mean()), 1),
            'recencia_med': round(float(subset['recencia_dias'].mean()), 0),
            'checkouts_med': round(float(subset['n_checkouts'].mean()), 1),
            'area_med': round(float(subset['area_loja_m2'].mean()), 1),
            'visitas_med': round(float(subset['total_visitas'].mean()), 1),
            'conv_visitas_med': round(float(subset['taxa_conversao_visitas'].mean()) * 100, 1),
            'canais': subset['canal'].value_counts().to_dict(),
            'portes': subset['porte'].value_counts().to_dict(),
            'regioes': subset['regiao_comercial'].value_counts().to_dict()
        })

    vendedores_list = []
    for _, r in vend_full.iterrows():
        vendedores_list.append({
            'id': str(r['vendedor_id']),
            'nome': str(r['nome_vendedor_ficticio']),
            'regiao': str(r['regiao_comercial']),
            'admissao': str(r['data_admissao'])[:10] if pd.notnull(r['data_admissao']) else '',
            'custo_mensal': float(r['custo_mensal_total']),
            'meta_rec_mensal': float(r['meta_receita_mensal']),
            'meta_margem_pct': round(float(r['meta_margem_pct']) * 100, 2),
            'rec_total': round(float(r['receita_total']), 2),
            'margem_total': round(float(r['margem_total']), 2),
            'margem_pct': round(float(r['margem_realizada_pct']) * 100, 2),
            'pedidos': int(r['pedidos_total']),
            'clientes_ativos': int(r['clientes_atendidos']),
            'visitas_total': int(r['total_visitas']),
            'visitas_pedidos': int(r['visitas_com_pedido']),
            'conv_visitas': round(float(r['conversao_visitas_pct']) * 100, 1),
            'ating_rec_pct': round(float(r['atingimento_receita_pct']) * 100, 1),
            'ating_margem_pct': round(float(r['atingimento_margem_pct']) * 100, 1),
            'desconto_pct': round(float(r['desconto_medio_pct']) * 100, 2),
            'checkin_pct': round(float(r['checkin_ok_pct']) * 100, 1),
            'perfil': str(r['perfil_vendedor']),
            'capacidade_visitas': int(r['capacidade_visitas_mes'])
        })

    skus_list = []
    for _, r in sku_full.iterrows():
        skus_list.append({
            'sku_id': str(r['sku_id']),
            'nome': str(r['sku_nome']),
            'categoria': str(r['categoria']),
            'subcategoria': str(r['subcategoria']),
            'marca': str(r['marca']),
            'formato': str(r['formato']),
            'volume': str(r['volume']),
            'preco_lista': float(r['preco_lista']),
            'custo_unit': float(r['custo_unitario']),
            'status': str(r['status_sku']),
            'substituto': str(r['substituto_sku_id']) if pd.notnull(r['substituto_sku_id']) else None,
            'rec_total': round(float(r['receita_total']), 2),
            'qtd_total': int(r['quantidade_total']),
            'volume_kg': round(float(r['volume_kg_total']), 1),
            'margem_total': round(float(r['margem_total']), 2),
            'margem_pct': round(float(r['margem_pct']) * 100, 2),
            'desconto_pct': round(float(r['desconto_medio_pct']) * 100, 2),
            'curva_abc': str(r['curva_abc']),
            'pedidos': int(r['pedidos_total']),
            'clientes': int(r['clientes_atendidos'])
        })

    cat_names = co_matrix_pct.index.tolist()
    cross_sell_matrix = {
        'categorias': cat_names,
        'matrix': [[round(float(co_matrix_pct.loc[r, c]) * 100, 1) for c in cat_names] for r in cat_names]
    }

    temporal_geral = []
    for _, r in vendas_mes_total.iterrows():
        temporal_geral.append({
            'mes': str(r['mes_ref']),
            'rec_liq': round(float(r['receita_liquida']), 2),
            'rec_bruta': round(float(r['receita_bruta']), 2),
            'desconto': round(float(r['desconto']), 2),
            'margem': round(float(r['margem_contribuicao']), 2),
            'margem_pct': round(float(r['margem_pct']) * 100, 2),
            'desconto_pct': round(float(r['desconto_pct']) * 100, 2),
            'pedidos': int(r['pedidos']),
            'clientes_ativos': int(r['clientes_ativos'])
        })

    visitas_padroes_list = []
    for _, r in visitas_padrao.iterrows():
        visitas_padroes_list.append({
            'faixa': str(r['duracao_faixa']),
            'tipo': str(r['tipo_visita']),
            'total': int(r['total']),
            'com_pedido': int(r['com_pedido']),
            'conversao_pct': round(float(r['taxa_conversao']) * 100, 1)
        })

    desconto_curva_list = []
    for _, r in desconto_margem.iterrows():
        desconto_curva_list.append({
            'faixa': str(r['faixa_desconto']),
            'itens': int(r['total_itens']),
            'rec_liq': round(float(r['receita_liquida']), 2),
            'desconto': round(float(r['desconto_total']), 2),
            'margem': round(float(r['margem_total']), 2),
            'margem_pct': round(float(r['margem_pct']) * 100, 2)
        })

    geo_list = []
    for _, r in geo_uf.iterrows():
        geo_list.append({
            'uf': str(r['uf']),
            'regiao': str(r['regiao_comercial']),
            'rec_liq': round(float(r['receita_liquida']), 2),
            'margem': round(float(r['margem_contribuicao']), 2),
            'margem_pct': round(float(r['margem_pct']) * 100, 2),
            'clientes': int(r['clientes_atendidos']),
            'pedidos': int(r['pedidos_total']),
            'potencial_24m': round(float(r['potencial_total_24m']), 2),
            'share_pct': round(float(r['share_vlimp_pct']) * 100, 2)
        })

    print("Calculando histórico mensal por cliente...", flush=True)
    df_faturado['ano_mes'] = df_faturado['mes_ref']
    cli_mes = df_faturado.groupby(['cliente_id', 'ano_mes'])['receita_liquida'].sum().unstack(fill_value=0)
    last_months = sorted(df_faturado['ano_mes'].unique())[-6:]
    cli_mes_dict = {}
    for cid in cli_full['cliente_id']:
        if cid in cli_mes.index:
            cli_mes_dict[str(cid)] = [round(float(cli_mes.loc[cid, m]), 1) if m in cli_mes.columns else 0 for m in last_months]
        else:
            cli_mes_dict[str(cid)] = [0] * len(last_months)

    cli_cat = df_faturado_prod.groupby(['cliente_id', 'categoria'])['receita_liquida'].sum().unstack(fill_value=0)
    all_cats = sorted(df_produtos['categoria'].dropna().unique().tolist())
    cli_cat_dict = {}
    for cid in cli_full['cliente_id']:
        if cid in cli_cat.index:
            cli_cat_dict[str(cid)] = {cat: round(float(cli_cat.loc[cid, cat]), 1) if cat in cli_cat.columns else 0 for cat in all_cats}
        else:
            cli_cat_dict[str(cid)] = {cat: 0 for cat in all_cats}

    print("Mapeando top SKUs por cliente...", flush=True)
    cli_sku_top = df_faturado.groupby(['cliente_id', 'sku_id'])['receita_liquida'].sum().reset_index()
    cli_sku_top = cli_sku_top.sort_values(['cliente_id', 'receita_liquida'], ascending=[True, False])
    cli_top_skus_dict = {}
    for cid, group in cli_sku_top.groupby('cliente_id'):
        top3 = group.head(3)[['sku_id', 'receita_liquida']].to_dict(orient='records')
        cli_top_skus_dict[str(cid)] = top3

    tot_rec_liq = float(df_faturado['receita_liquida'].sum())
    tot_rec_bruta = float(df_faturado['receita_bruta'].sum())
    tot_desconto = float(df_faturado['desconto'].sum())
    tot_margem = float(df_faturado['margem_contribuicao'].sum())
    tot_pedidos = int(df_faturado['pedido_id'].nunique())
    tot_clientes_ativos = int(df_faturado['cliente_id'].nunique())
    tot_visitas = int(len(df_visitas))
    tot_visitas_com_pedido = int((df_visitas['resultado_visita'] == 'Pedido').sum())

    dashboard_data = {
        'kpis': {
            'receita_liquida_total': round(tot_rec_liq, 2),
            'receita_bruta_total': round(tot_rec_bruta, 2),
            'desconto_total': round(tot_desconto, 2),
            'margem_total': round(tot_margem, 2),
            'margem_pct_media': round((tot_margem / tot_rec_liq) * 100, 2),
            'desconto_pct_medio': round((tot_desconto / tot_rec_bruta) * 100, 2),
            'total_pedidos': tot_pedidos,
            'ticket_medio': round(tot_rec_liq / tot_pedidos, 2),
            'total_clientes_base': len(df_clientes),
            'total_clientes_ativos': tot_clientes_ativos,
            'taxa_ativacao_pdvs': round((tot_clientes_ativos / len(df_clientes)) * 100, 1),
            'total_visitas': tot_visitas,
            'taxa_conversao_visitas': round((tot_visitas_com_pedido / tot_visitas) * 100, 1)
        },
        'clusters': clusters_resumo,
        'clientes': clientes_micro,
        'clientes_sparklines': {
            'meses': last_months,
            'dados': cli_mes_dict
        },
        'clientes_mix': {
            'categorias': all_cats,
            'dados': cli_cat_dict
        },
        'clientes_top_skus': cli_top_skus_dict,
        'vendedores': vendedores_list,
        'produtos': skus_list,
        'cross_sell': cross_sell_matrix,
        'temporal': temporal_geral,
        'visitas_padroes': visitas_padroes_list,
        'desconto_curva': desconto_curva_list,
        'geografia': geo_list
    }

    out_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(out_dir, "data.json")
    js_path = os.path.join(out_dir, "data.js")

    print(f"Salvando dados em {json_path} e {js_path}...", flush=True)
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(dashboard_data, f, ensure_ascii=False)

    with open(js_path, 'w', encoding='utf-8') as f:
        f.write("window.VLIMP_DATA = ")
        json.dump(dashboard_data, f, ensure_ascii=False)
        f.write(";\n")

    print("Processamento concluído com sucesso!", flush=True)

if __name__ == '__main__':
    main()
