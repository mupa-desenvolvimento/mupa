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
