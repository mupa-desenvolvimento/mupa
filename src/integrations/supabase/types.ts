export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      categorias: {
        Row: {
          caminho: string | null
          id: string
          nome: string | null
          parent_id: string | null
          total_produtos: number | null
        }
        Insert: {
          caminho?: string | null
          id: string
          nome?: string | null
          parent_id?: string | null
          total_produtos?: number | null
        }
        Update: {
          caminho?: string | null
          id?: string
          nome?: string | null
          parent_id?: string | null
          total_produtos?: number | null
        }
        Relationships: []
      }
      dispositivo_grupos: {
        Row: {
          atualizado_em: string
          criado_em: string
          id: string
          nome: string
          parent_id: string | null
          playlist_id: string | null
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          nome: string
          parent_id?: string | null
          playlist_id?: string | null
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          nome?: string
          parent_id?: string | null
          playlist_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispositivo_grupos_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "dispositivo_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispositivo_grupos_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "terminal_playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      dispositivos: {
        Row: {
          ativado_em: string | null
          ativo: boolean
          codigo_ativacao: string
          config_override: Json
          criado_em: string
          empresa_id: string | null
          grupo_id: string | null
          id: string
          input_remoto_ativo: boolean
          loja_numero: string | null
          nome: string
          ultimo_acesso: string | null
        }
        Insert: {
          ativado_em?: string | null
          ativo?: boolean
          codigo_ativacao?: string
          config_override?: Json
          criado_em?: string
          empresa_id?: string | null
          grupo_id?: string | null
          id?: string
          input_remoto_ativo?: boolean
          loja_numero?: string | null
          nome?: string
          ultimo_acesso?: string | null
        }
        Update: {
          ativado_em?: string | null
          ativo?: boolean
          codigo_ativacao?: string
          config_override?: Json
          criado_em?: string
          empresa_id?: string | null
          grupo_id?: string | null
          id?: string
          input_remoto_ativo?: boolean
          loja_numero?: string | null
          nome?: string
          ultimo_acesso?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispositivos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispositivos_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "dispositivo_grupos"
            referencedColumns: ["id"]
          },
        ]
      }
      empresa_api_config: {
        Row: {
          api_token: string | null
          api_url: string
          ativo: boolean
          atualizado_em: string
          criado_em: string
          empresa_id: string
          id: string
          tipo_api: string
        }
        Insert: {
          api_token?: string | null
          api_url: string
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          empresa_id: string
          id?: string
          tipo_api?: string
        }
        Update: {
          api_token?: string | null
          api_url?: string
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          empresa_id?: string
          id?: string
          tipo_api?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresa_api_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresa_midias: {
        Row: {
          ativo: boolean
          criado_em: string
          duracao_segundos: number
          empresa_id: string
          id: string
          nome: string
          ordem: number
          storage_path: string
          tipo: string
          url: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          duracao_segundos?: number
          empresa_id: string
          id?: string
          nome: string
          ordem?: number
          storage_path: string
          tipo: string
          url: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          duracao_segundos?: number
          empresa_id?: string
          id?: string
          nome?: string
          ordem?: number
          storage_path?: string
          tipo?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresa_midias_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresa_preco_config: {
        Row: {
          ativo: boolean
          atualizado_em: string
          consulta_auth_type: string
          consulta_ean_param: string
          consulta_headers: Json
          consulta_loja_param: string
          consulta_method: string
          consulta_params_fixos: Json
          consulta_url: string
          criado_em: string
          data_path: string
          empresa_id: string
          id: string
          mapeamento_campos: Json
          token_body: Json
          token_expiry_field: string | null
          token_expiry_seconds: number | null
          token_headers: Json
          token_method: string
          token_response_path: string
          token_url: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          consulta_auth_type?: string
          consulta_ean_param?: string
          consulta_headers?: Json
          consulta_loja_param?: string
          consulta_method?: string
          consulta_params_fixos?: Json
          consulta_url: string
          criado_em?: string
          data_path?: string
          empresa_id: string
          id?: string
          mapeamento_campos?: Json
          token_body?: Json
          token_expiry_field?: string | null
          token_expiry_seconds?: number | null
          token_headers?: Json
          token_method?: string
          token_response_path?: string
          token_url: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          consulta_auth_type?: string
          consulta_ean_param?: string
          consulta_headers?: Json
          consulta_loja_param?: string
          consulta_method?: string
          consulta_params_fixos?: Json
          consulta_url?: string
          criado_em?: string
          data_path?: string
          empresa_id?: string
          id?: string
          mapeamento_campos?: Json
          token_body?: Json
          token_expiry_field?: string | null
          token_expiry_seconds?: number | null
          token_headers?: Json
          token_method?: string
          token_response_path?: string
          token_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresa_preco_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresa_token_cache: {
        Row: {
          criado_em: string
          empresa_id: string
          expira_em: string
          id: string
          token: string
          token_type: string | null
        }
        Insert: {
          criado_em?: string
          empresa_id: string
          expira_em: string
          id?: string
          token: string
          token_type?: string | null
        }
        Update: {
          criado_em?: string
          empresa_id?: string
          expira_em?: string
          id?: string
          token?: string
          token_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empresa_token_cache_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresa_usuarios: {
        Row: {
          criado_em: string
          empresa_id: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          criado_em?: string
          empresa_id: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          criado_em?: string
          empresa_id?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresa_usuarios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          ativo: boolean
          atualizado_em: string
          codigo_vinculo: string
          criado_em: string
          id: string
          logo_url: string | null
          nome: string
          slug: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          codigo_vinculo?: string
          criado_em?: string
          id?: string
          logo_url?: string | null
          nome: string
          slug: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          codigo_vinculo?: string
          criado_em?: string
          id?: string
          logo_url?: string | null
          nome?: string
          slug?: string
        }
        Relationships: []
      }
      marcas: {
        Row: {
          id: string
          nome: string
          total_produtos: number | null
        }
        Insert: {
          id?: string
          nome: string
          total_produtos?: number | null
        }
        Update: {
          id?: string
          nome?: string
          total_produtos?: number | null
        }
        Relationships: []
      }
      produtos: {
        Row: {
          atualizado_em: string
          categoria: string | null
          categoria_id: string | null
          clusters: Json | null
          criado_em: string
          descricao: string | null
          disponivel: boolean | null
          ean: string
          id: string
          imagem_baixada: boolean | null
          imagem_local: string | null
          imagem_url_azure: string | null
          imagem_url_vtex: string | null
          link_rissul: string | null
          marca: string | null
          multiplicador: number | null
          nome: string
          nome_curto: string | null
          preco: number | null
          preco_lista: number | null
          product_id: string | null
          slug: string | null
          unidade_medida: string | null
        }
        Insert: {
          atualizado_em?: string
          categoria?: string | null
          categoria_id?: string | null
          clusters?: Json | null
          criado_em?: string
          descricao?: string | null
          disponivel?: boolean | null
          ean: string
          id?: string
          imagem_baixada?: boolean | null
          imagem_local?: string | null
          imagem_url_azure?: string | null
          imagem_url_vtex?: string | null
          link_rissul?: string | null
          marca?: string | null
          multiplicador?: number | null
          nome: string
          nome_curto?: string | null
          preco?: number | null
          preco_lista?: number | null
          product_id?: string | null
          slug?: string | null
          unidade_medida?: string | null
        }
        Update: {
          atualizado_em?: string
          categoria?: string | null
          categoria_id?: string | null
          clusters?: Json | null
          criado_em?: string
          descricao?: string | null
          disponivel?: boolean | null
          ean?: string
          id?: string
          imagem_baixada?: boolean | null
          imagem_local?: string | null
          imagem_url_azure?: string | null
          imagem_url_vtex?: string | null
          link_rissul?: string | null
          marca?: string | null
          multiplicador?: number | null
          nome?: string
          nome_curto?: string | null
          preco?: number | null
          preco_lista?: number | null
          product_id?: string | null
          slug?: string | null
          unidade_medida?: string | null
        }
        Relationships: []
      }
      sugestoes_cache: {
        Row: {
          categorias_ai: string[]
          chave_perfil: string | null
          criado_em: string
          ean: string
          id: string
          tipo: string
        }
        Insert: {
          categorias_ai: string[]
          chave_perfil?: string | null
          criado_em?: string
          ean: string
          id?: string
          tipo: string
        }
        Update: {
          categorias_ai?: string[]
          chave_perfil?: string | null
          criado_em?: string
          ean?: string
          id?: string
          tipo?: string
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          current_offset: number | null
          erro: string | null
          finalizado_em: string | null
          id: string
          imagens_baixadas: number | null
          iniciado_em: string | null
          produtos_atualizados: number | null
          produtos_novos: number | null
          status: string | null
          total_produtos: number | null
        }
        Insert: {
          current_offset?: number | null
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          imagens_baixadas?: number | null
          iniciado_em?: string | null
          produtos_atualizados?: number | null
          produtos_novos?: number | null
          status?: string | null
          total_produtos?: number | null
        }
        Update: {
          current_offset?: number | null
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          imagens_baixadas?: number | null
          iniciado_em?: string | null
          produtos_atualizados?: number | null
          produtos_novos?: number | null
          status?: string | null
          total_produtos?: number | null
        }
        Relationships: []
      }
      terminal_config: {
        Row: {
          atualizado_em: string
          chave: string
          id: string
          valor: string
        }
        Insert: {
          atualizado_em?: string
          chave: string
          id?: string
          valor: string
        }
        Update: {
          atualizado_em?: string
          chave?: string
          id?: string
          valor?: string
        }
        Relationships: []
      }
      terminal_media: {
        Row: {
          ativo: boolean
          criado_em: string
          duracao_segundos: number
          id: string
          nome: string
          ordem: number
          storage_path: string
          tipo: string
          url: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          duracao_segundos?: number
          id?: string
          nome: string
          ordem?: number
          storage_path: string
          tipo: string
          url: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          duracao_segundos?: number
          id?: string
          nome?: string
          ordem?: number
          storage_path?: string
          tipo?: string
          url?: string
        }
        Relationships: []
      }
      terminal_playlist_items: {
        Row: {
          ativo: boolean
          criado_em: string
          duracao_segundos: number | null
          id: string
          media_id: string
          ordem: number
          playlist_id: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          duracao_segundos?: number | null
          id?: string
          media_id: string
          ordem?: number
          playlist_id: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          duracao_segundos?: number | null
          id?: string
          media_id?: string
          ordem?: number
          playlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminal_playlist_items_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "terminal_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terminal_playlist_items_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "terminal_playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      terminal_playlists: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      tts_cache: {
        Row: {
          cache_key: string
          criado_em: string
          id: string
          storage_path: string
          texto: string
        }
        Insert: {
          cache_key: string
          criado_em?: string
          id?: string
          storage_path: string
          texto: string
        }
        Update: {
          cache_key?: string
          criado_em?: string
          id?: string
          storage_path?: string
          texto?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_terminal_device: {
        Args: {
          p_codigo_empresa: string
          p_device_id?: string
          p_device_name?: string
          p_grupo_id?: string
          p_loja_numero?: string
        }
        Returns: Json
      }
      generate_dispositivo_codigo: { Args: never; Returns: string }
      generate_empresa_codigo: { Args: never; Returns: string }
      random_base32_code: { Args: { len?: number }; Returns: string }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
