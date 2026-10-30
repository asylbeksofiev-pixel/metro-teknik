
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "academic_years": {
                  Row: {
                    "created_at": string,"ends_on": string,"id": string,"is_current": boolean,"name": string,"school_id": string,"starts_on": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ends_on": string,"id"?: string,"is_current"?: boolean,"name": string,"school_id": string,"starts_on": string
                  }
                  Update: {
                    "created_at"?: string,"ends_on"?: string,"id"?: string,"is_current"?: boolean,"name"?: string,"school_id"?: string,"starts_on"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "academic_years_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_explanations": {
                  Row: {
                    "answer_id": string,"created_at": string,"id": string,"locale": Database["public"]['Enums']["app_locale"],"messages": NonNullable<Json>,"model": string | null,"student_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answer_id": string,"created_at"?: string,"id"?: string,"locale": Database["public"]['Enums']["app_locale"],"messages"?: NonNullable<Json>,"model"?: string | null,"student_id": string,"updated_at"?: string
                  }
                  Update: {
                    "answer_id"?: string,"created_at"?: string,"id"?: string,"locale"?: Database["public"]['Enums']["app_locale"],"messages"?: NonNullable<Json>,"model"?: string | null,"student_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_explanations_answer_id_fkey"
      columns: ["answer_id"]
isOneToOne: false
      referencedRelation: "answers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_explanations_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_usage": {
                  Row: {
                    "completion_tokens": number | null,"created_at": string,"feature": string,"id": string,"latency_ms": number | null,"model": string,"prompt_tokens": number | null,"school_id": string | null,"success": boolean,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "completion_tokens"?: number | null,"created_at"?: string,"feature": string,"id"?: string,"latency_ms"?: number | null,"model": string,"prompt_tokens"?: number | null,"school_id"?: string | null,"success": boolean,"user_id"?: string | null
                  }
                  Update: {
                    "completion_tokens"?: number | null,"created_at"?: string,"feature"?: string,"id"?: string,"latency_ms"?: number | null,"model"?: string,"prompt_tokens"?: number | null,"school_id"?: string | null,"success"?: boolean,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_usage_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_usage_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"answers": {
                  Row: {
                    "attempt_id": string,"client_seq": number,"created_at": string,"flagged": boolean,"id": string,"question_id": string,"response": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_id": string,"client_seq"?: number,"created_at"?: string,"flagged"?: boolean,"id"?: string,"question_id": string,"response"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "attempt_id"?: string,"client_seq"?: number,"created_at"?: string,"flagged"?: boolean,"id"?: string,"question_id"?: string,"response"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "answers_attempt_id_fkey"
      columns: ["attempt_id"]
isOneToOne: false
      referencedRelation: "attempts"
      referencedColumns: ["id"]
    }
                  ]
                },"assessment_assignments": {
                  Row: {
                    "assessment_id": string,"class_id": string | null,"created_at": string,"id": string,"student_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "assessment_id": string,"class_id"?: string | null,"created_at"?: string,"id"?: string,"student_id"?: string | null
                  }
                  Update: {
                    "assessment_id"?: string,"class_id"?: string | null,"created_at"?: string,"id"?: string,"student_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "assessment_assignments_assessment_id_fkey"
      columns: ["assessment_id"]
isOneToOne: false
      referencedRelation: "assessments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assessment_assignments_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assessment_assignments_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"assessment_questions": {
                  Row: {
                    "ai_generated": boolean,"ai_uncertain": boolean,"answer_key": NonNullable<Json>,"assessment_id": string,"bank_item_id": string | null,"content": NonNullable<Json>,"created_at": string,"explanation": string | null,"id": string,"learning_objective": string | null,"points": number,"position": number,"reveal_after_release": boolean,"rubric": Json | null,"section_id": string | null,"topic": string | null,"type": Database["public"]['Enums']["question_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_generated"?: boolean,"ai_uncertain"?: boolean,"answer_key"?: NonNullable<Json>,"assessment_id": string,"bank_item_id"?: string | null,"content": NonNullable<Json>,"created_at"?: string,"explanation"?: string | null,"id"?: string,"learning_objective"?: string | null,"points"?: number,"position"?: number,"reveal_after_release"?: boolean,"rubric"?: Json | null,"section_id"?: string | null,"topic"?: string | null,"type": Database["public"]['Enums']["question_type"],"updated_at"?: string
                  }
                  Update: {
                    "ai_generated"?: boolean,"ai_uncertain"?: boolean,"answer_key"?: NonNullable<Json>,"assessment_id"?: string,"bank_item_id"?: string | null,"content"?: NonNullable<Json>,"created_at"?: string,"explanation"?: string | null,"id"?: string,"learning_objective"?: string | null,"points"?: number,"position"?: number,"reveal_after_release"?: boolean,"rubric"?: Json | null,"section_id"?: string | null,"topic"?: string | null,"type"?: Database["public"]['Enums']["question_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assessment_questions_assessment_id_fkey"
      columns: ["assessment_id"]
isOneToOne: false
      referencedRelation: "assessments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assessment_questions_bank_item_id_fkey"
      columns: ["bank_item_id"]
isOneToOne: false
      referencedRelation: "question_bank_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assessment_questions_section_id_fkey"
      columns: ["section_id"]
isOneToOne: false
      referencedRelation: "assessment_sections"
      referencedColumns: ["id"]
    }
                  ]
                },"assessment_sections": {
                  Row: {
                    "assessment_id": string,"id": string,"instructions": string | null,"position": number,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assessment_id": string,"id"?: string,"instructions"?: string | null,"position"?: number,"title": string
                  }
                  Update: {
                    "assessment_id"?: string,"id"?: string,"instructions"?: string | null,"position"?: number,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assessment_sections_assessment_id_fkey"
      columns: ["assessment_id"]
isOneToOne: false
      referencedRelation: "assessments"
      referencedColumns: ["id"]
    }
                  ]
                },"assessment_snapshot_keys": {
                  Row: {
                    "answer_key": NonNullable<Json>,"explanation": string | null,"points": number,"question_id": string,"reveal_after_release": boolean,"rubric": Json | null,"snapshot_id": string,"type": Database["public"]['Enums']["question_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "answer_key": NonNullable<Json>,"explanation"?: string | null,"points": number,"question_id": string,"reveal_after_release"?: boolean,"rubric"?: Json | null,"snapshot_id": string,"type": Database["public"]['Enums']["question_type"]
                  }
                  Update: {
                    "answer_key"?: NonNullable<Json>,"explanation"?: string | null,"points"?: number,"question_id"?: string,"reveal_after_release"?: boolean,"rubric"?: Json | null,"snapshot_id"?: string,"type"?: Database["public"]['Enums']["question_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "assessment_snapshot_keys_snapshot_id_fkey"
      columns: ["snapshot_id"]
isOneToOne: false
      referencedRelation: "assessment_snapshots"
      referencedColumns: ["id"]
    }
                  ]
                },"assessment_snapshots": {
                  Row: {
                    "assessment_id": string,"created_at": string,"created_by": string | null,"id": string,"instructions": string | null,"questions": NonNullable<Json>,"sections": NonNullable<Json>,"title": string,"total_points": number,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "assessment_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"instructions"?: string | null,"questions": NonNullable<Json>,"sections"?: NonNullable<Json>,"title": string,"total_points": number,"version": number
                  }
                  Update: {
                    "assessment_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"instructions"?: string | null,"questions"?: NonNullable<Json>,"sections"?: NonNullable<Json>,"title"?: string,"total_points"?: number,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "assessment_snapshots_assessment_id_fkey"
      columns: ["assessment_id"]
isOneToOne: false
      referencedRelation: "assessments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assessment_snapshots_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"assessments": {
                  Row: {
                    "allow_ai_explanations": boolean,"allow_ai_followup": boolean,"allow_navigation": boolean,"allow_practice": boolean,"class_id": string | null,"created_at": string,"created_by": string,"current_snapshot_id": string | null,"due_at": string | null,"duration_minutes": number | null,"grade": number | null,"grading_profile": Database["public"]['Enums']["grading_profile"],"id": string,"instructions": string | null,"kind": Database["public"]['Enums']["assessment_kind"],"lockdown_mode": boolean,"max_attempts": number,"published_at": string | null,"release_mode": Database["public"]['Enums']["release_mode"],"school_id": string,"show_correct_answers": boolean,"shuffle_options": boolean,"shuffle_questions": boolean,"source_job_id": string | null,"starts_at": string | null,"status": Database["public"]['Enums']["assessment_status"],"subject_id": string | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allow_ai_explanations"?: boolean,"allow_ai_followup"?: boolean,"allow_navigation"?: boolean,"allow_practice"?: boolean,"class_id"?: string | null,"created_at"?: string,"created_by": string,"current_snapshot_id"?: string | null,"due_at"?: string | null,"duration_minutes"?: number | null,"grade"?: number | null,"grading_profile"?: Database["public"]['Enums']["grading_profile"],"id"?: string,"instructions"?: string | null,"kind"?: Database["public"]['Enums']["assessment_kind"],"lockdown_mode"?: boolean,"max_attempts"?: number,"published_at"?: string | null,"release_mode"?: Database["public"]['Enums']["release_mode"],"school_id": string,"show_correct_answers"?: boolean,"shuffle_options"?: boolean,"shuffle_questions"?: boolean,"source_job_id"?: string | null,"starts_at"?: string | null,"status"?: Database["public"]['Enums']["assessment_status"],"subject_id"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "allow_ai_explanations"?: boolean,"allow_ai_followup"?: boolean,"allow_navigation"?: boolean,"allow_practice"?: boolean,"class_id"?: string | null,"created_at"?: string,"created_by"?: string,"current_snapshot_id"?: string | null,"due_at"?: string | null,"duration_minutes"?: number | null,"grade"?: number | null,"grading_profile"?: Database["public"]['Enums']["grading_profile"],"id"?: string,"instructions"?: string | null,"kind"?: Database["public"]['Enums']["assessment_kind"],"lockdown_mode"?: boolean,"max_attempts"?: number,"published_at"?: string | null,"release_mode"?: Database["public"]['Enums']["release_mode"],"school_id"?: string,"show_correct_answers"?: boolean,"shuffle_options"?: boolean,"shuffle_questions"?: boolean,"source_job_id"?: string | null,"starts_at"?: string | null,"status"?: Database["public"]['Enums']["assessment_status"],"subject_id"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assessments_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assessments_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assessments_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assessments_snapshot_fk"
      columns: ["current_snapshot_id"]
isOneToOne: false
      referencedRelation: "assessment_snapshots"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assessments_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    }
                  ]
                },"attempts": {
                  Row: {
                    "answered_count": number,"assessment_id": string,"attempt_no": number,"created_at": string,"current_question_id": string | null,"deadline_at": string | null,"grading_status": Database["public"]['Enums']["grading_status"],"id": string,"last_seen_at": string,"lockdown_event_count": number,"option_orders": NonNullable<Json>,"question_order": (string)[],"snapshot_id": string,"started_at": string,"status": Database["public"]['Enums']["attempt_status"],"student_id": string,"submit_reason": Database["public"]['Enums']["submit_reason"] | null,"submitted_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "answered_count"?: number,"assessment_id": string,"attempt_no": number,"created_at"?: string,"current_question_id"?: string | null,"deadline_at"?: string | null,"grading_status"?: Database["public"]['Enums']["grading_status"],"id"?: string,"last_seen_at"?: string,"lockdown_event_count"?: number,"option_orders"?: NonNullable<Json>,"question_order": (string)[],"snapshot_id": string,"started_at"?: string,"status"?: Database["public"]['Enums']["attempt_status"],"student_id": string,"submit_reason"?: Database["public"]['Enums']["submit_reason"] | null,"submitted_at"?: string | null
                  }
                  Update: {
                    "answered_count"?: number,"assessment_id"?: string,"attempt_no"?: number,"created_at"?: string,"current_question_id"?: string | null,"deadline_at"?: string | null,"grading_status"?: Database["public"]['Enums']["grading_status"],"id"?: string,"last_seen_at"?: string,"lockdown_event_count"?: number,"option_orders"?: NonNullable<Json>,"question_order"?: (string)[],"snapshot_id"?: string,"started_at"?: string,"status"?: Database["public"]['Enums']["attempt_status"],"student_id"?: string,"submit_reason"?: Database["public"]['Enums']["submit_reason"] | null,"submitted_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "attempts_assessment_id_fkey"
      columns: ["assessment_id"]
isOneToOne: false
      referencedRelation: "assessments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attempts_snapshot_id_fkey"
      columns: ["snapshot_id"]
isOneToOne: false
      referencedRelation: "assessment_snapshots"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attempts_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_events": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"entity_id": string | null,"entity_type": string,"id": string,"metadata": NonNullable<Json>,"school_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: string,"metadata"?: NonNullable<Json>,"school_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"school_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_events_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"class_enrollments": {
                  Row: {
                    "class_id": string,"created_at": string,"id": string,"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "class_id": string,"created_at"?: string,"id"?: string,"student_id": string
                  }
                  Update: {
                    "class_id"?: string,"created_at"?: string,"id"?: string,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "class_enrollments_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "class_enrollments_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"class_teachers": {
                  Row: {
                    "class_id": string,"created_at": string,"id": string,"subject_id": string | null,"teacher_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "class_id": string,"created_at"?: string,"id"?: string,"subject_id"?: string | null,"teacher_id": string
                  }
                  Update: {
                    "class_id"?: string,"created_at"?: string,"id"?: string,"subject_id"?: string | null,"teacher_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "class_teachers_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "class_teachers_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "class_teachers_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"classes": {
                  Row: {
                    "academic_year_id": string | null,"created_at": string,"grade": number,"id": string,"name": string,"school_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "academic_year_id"?: string | null,"created_at"?: string,"grade": number,"id"?: string,"name": string,"school_id": string
                  }
                  Update: {
                    "academic_year_id"?: string | null,"created_at"?: string,"grade"?: number,"id"?: string,"name"?: string,"school_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "classes_academic_year_id_fkey"
      columns: ["academic_year_id"]
isOneToOne: false
      referencedRelation: "academic_years"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "classes_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"criterion_scores": {
                  Row: {
                    "comment": string | null,"criterion_id": string,"id": string,"max_score": number,"score": number,"suggestion_id": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "comment"?: string | null,"criterion_id": string,"id"?: string,"max_score": number,"score": number,"suggestion_id": string,"title": string
                  }
                  Update: {
                    "comment"?: string | null,"criterion_id"?: string,"id"?: string,"max_score"?: number,"score"?: number,"suggestion_id"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "criterion_scores_suggestion_id_fkey"
      columns: ["suggestion_id"]
isOneToOne: false
      referencedRelation: "grading_suggestions"
      referencedColumns: ["id"]
    }
                  ]
                },"final_grades": {
                  Row: {
                    "approved_at": string,"approved_by": string,"assessment_id": string,"attempt_id": string,"feedback": string | null,"max_score": number,"percent": number,"score": number,"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string,"approved_by": string,"assessment_id": string,"attempt_id": string,"feedback"?: string | null,"max_score": number,"percent": number,"score": number,"student_id": string
                  }
                  Update: {
                    "approved_at"?: string,"approved_by"?: string,"assessment_id"?: string,"attempt_id"?: string,"feedback"?: string | null,"max_score"?: number,"percent"?: number,"score"?: number,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "final_grades_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "final_grades_assessment_id_fkey"
      columns: ["assessment_id"]
isOneToOne: false
      referencedRelation: "assessments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "final_grades_attempt_id_fkey"
      columns: ["attempt_id"]
isOneToOne: true
      referencedRelation: "attempts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "final_grades_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"grading_jobs": {
                  Row: {
                    "answer_id": string,"attempt_id": string,"created_at": string,"id": string,"last_error": string | null,"locked_at": string | null,"requested_by": string | null,"status": Database["public"]['Enums']["grading_job_status"],"tries": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answer_id": string,"attempt_id": string,"created_at"?: string,"id"?: string,"last_error"?: string | null,"locked_at"?: string | null,"requested_by"?: string | null,"status"?: Database["public"]['Enums']["grading_job_status"],"tries"?: number,"updated_at"?: string
                  }
                  Update: {
                    "answer_id"?: string,"attempt_id"?: string,"created_at"?: string,"id"?: string,"last_error"?: string | null,"locked_at"?: string | null,"requested_by"?: string | null,"status"?: Database["public"]['Enums']["grading_job_status"],"tries"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "grading_jobs_answer_id_fkey"
      columns: ["answer_id"]
isOneToOne: false
      referencedRelation: "answers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "grading_jobs_attempt_id_fkey"
      columns: ["attempt_id"]
isOneToOne: false
      referencedRelation: "attempts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "grading_jobs_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"grading_suggestions": {
                  Row: {
                    "answer_id": string,"confidence": number,"created_at": string,"explanation": string,"feedback": string,"id": string,"job_id": string | null,"max_score": number,"model": string | null,"needs_manual_review": boolean,"profile": Database["public"]['Enums']["grading_profile"],"suggested_score": number
                  }
                  ComputedFields: never
                  Insert: {
                    "answer_id": string,"confidence": number,"created_at"?: string,"explanation": string,"feedback": string,"id"?: string,"job_id"?: string | null,"max_score": number,"model"?: string | null,"needs_manual_review": boolean,"profile": Database["public"]['Enums']["grading_profile"],"suggested_score": number
                  }
                  Update: {
                    "answer_id"?: string,"confidence"?: number,"created_at"?: string,"explanation"?: string,"feedback"?: string,"id"?: string,"job_id"?: string | null,"max_score"?: number,"model"?: string | null,"needs_manual_review"?: boolean,"profile"?: Database["public"]['Enums']["grading_profile"],"suggested_score"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "grading_suggestions_answer_id_fkey"
      columns: ["answer_id"]
isOneToOne: false
      referencedRelation: "answers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "grading_suggestions_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "grading_jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"class_id": string | null,"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string | null,"revoked_at": string | null,"role": Database["public"]['Enums']["school_role"],"school_id": string,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"class_id"?: string | null,"created_at"?: string,"email": string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"revoked_at"?: string | null,"role": Database["public"]['Enums']["school_role"],"school_id": string,"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"class_id"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"revoked_at"?: string | null,"role"?: Database["public"]['Enums']["school_role"],"school_id"?: string,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_accepted_by_fkey"
      columns: ["accepted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"lockdown_events": {
                  Row: {
                    "assessment_id": string,"attempt_id": string,"client_time": string | null,"duration_ms": number | null,"event_type": string,"id": string,"metadata": NonNullable<Json>,"occurred_at": string,"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assessment_id": string,"attempt_id": string,"client_time"?: string | null,"duration_ms"?: number | null,"event_type": string,"id"?: string,"metadata"?: NonNullable<Json>,"occurred_at"?: string,"student_id": string
                  }
                  Update: {
                    "assessment_id"?: string,"attempt_id"?: string,"client_time"?: string | null,"duration_ms"?: number | null,"event_type"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"occurred_at"?: string,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lockdown_events_assessment_id_fkey"
      columns: ["assessment_id"]
isOneToOne: false
      referencedRelation: "assessments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lockdown_events_attempt_id_fkey"
      columns: ["attempt_id"]
isOneToOne: false
      referencedRelation: "attempts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lockdown_events_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "created_at": string,"dedupe_key": string | null,"id": string,"link": string | null,"payload": NonNullable<Json>,"read_at": string | null,"type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"dedupe_key"?: string | null,"id"?: string,"link"?: string | null,"payload"?: NonNullable<Json>,"read_at"?: string | null,"type": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"dedupe_key"?: string | null,"id"?: string,"link"?: string | null,"payload"?: NonNullable<Json>,"read_at"?: string | null,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"ocr_jobs": {
                  Row: {
                    "assessment_id": string | null,"created_at": string,"created_by": string,"file_name": string,"hints": NonNullable<Json>,"id": string,"last_error": string | null,"locked_at": string | null,"mime_type": string,"page_count": number | null,"result": Json | null,"school_id": string,"size_bytes": number,"status": Database["public"]['Enums']["job_status"],"storage_path": string,"tries": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assessment_id"?: string | null,"created_at"?: string,"created_by": string,"file_name": string,"hints"?: NonNullable<Json>,"id"?: string,"last_error"?: string | null,"locked_at"?: string | null,"mime_type": string,"page_count"?: number | null,"result"?: Json | null,"school_id": string,"size_bytes": number,"status"?: Database["public"]['Enums']["job_status"],"storage_path": string,"tries"?: number,"updated_at"?: string
                  }
                  Update: {
                    "assessment_id"?: string | null,"created_at"?: string,"created_by"?: string,"file_name"?: string,"hints"?: NonNullable<Json>,"id"?: string,"last_error"?: string | null,"locked_at"?: string | null,"mime_type"?: string,"page_count"?: number | null,"result"?: Json | null,"school_id"?: string,"size_bytes"?: number,"status"?: Database["public"]['Enums']["job_status"],"storage_path"?: string,"tries"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ocr_jobs_assessment_id_fkey"
      columns: ["assessment_id"]
isOneToOne: false
      referencedRelation: "assessments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ocr_jobs_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ocr_jobs_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"ocr_transcriptions": {
                  Row: {
                    "created_at": string,"id": string,"job_id": string | null,"method": string,"notes": string | null,"page": number,"submission_file_id": string | null,"text": string,"uncertain": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"job_id"?: string | null,"method": string,"notes"?: string | null,"page"?: number,"submission_file_id"?: string | null,"text": string,"uncertain"?: boolean
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"job_id"?: string | null,"method"?: string,"notes"?: string | null,"page"?: number,"submission_file_id"?: string | null,"text"?: string,"uncertain"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "ocr_transcriptions_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "ocr_jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ocr_transcriptions_submission_file_id_fkey"
      columns: ["submission_file_id"]
isOneToOne: false
      referencedRelation: "submission_files"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_settings": {
                  Row: {
                    "key": string,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"updated_at"?: string,"updated_by"?: string | null,"value": NonNullable<Json>
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "platform_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"practice_questions": {
                  Row: {
                    "answer_key": NonNullable<Json>,"checked_result": Database["public"]['Enums']["score_result"] | null,"content": NonNullable<Json>,"created_at": string,"explanation": string | null,"id": string,"locale": Database["public"]['Enums']["app_locale"],"model": string | null,"source_answer_id": string | null,"student_id": string,"student_response": Json | null,"topic": string | null,"type": Database["public"]['Enums']["question_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "answer_key": NonNullable<Json>,"checked_result"?: Database["public"]['Enums']["score_result"] | null,"content": NonNullable<Json>,"created_at"?: string,"explanation"?: string | null,"id"?: string,"locale": Database["public"]['Enums']["app_locale"],"model"?: string | null,"source_answer_id"?: string | null,"student_id": string,"student_response"?: Json | null,"topic"?: string | null,"type": Database["public"]['Enums']["question_type"]
                  }
                  Update: {
                    "answer_key"?: NonNullable<Json>,"checked_result"?: Database["public"]['Enums']["score_result"] | null,"content"?: NonNullable<Json>,"created_at"?: string,"explanation"?: string | null,"id"?: string,"locale"?: Database["public"]['Enums']["app_locale"],"model"?: string | null,"source_answer_id"?: string | null,"student_id"?: string,"student_response"?: Json | null,"topic"?: string | null,"type"?: Database["public"]['Enums']["question_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "practice_questions_source_answer_id_fkey"
      columns: ["source_answer_id"]
isOneToOne: false
      referencedRelation: "answers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "practice_questions_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string | null,"full_name": string,"id": string,"is_super_admin": boolean,"locale": Database["public"]['Enums']["app_locale"],"login": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string,"id": string,"is_super_admin"?: boolean,"locale"?: Database["public"]['Enums']["app_locale"],"login"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string,"id"?: string,"is_super_admin"?: boolean,"locale"?: Database["public"]['Enums']["app_locale"],"login"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"question_bank_items": {
                  Row: {
                    "answer_key": NonNullable<Json>,"content": NonNullable<Json>,"created_at": string,"difficulty": Database["public"]['Enums']["difficulty"],"explanation": string | null,"grade": number | null,"id": string,"is_shared": boolean,"learning_objective": string | null,"owner_id": string,"points": number,"rubric": Json | null,"school_id": string,"subject_id": string | null,"topic": string | null,"type": Database["public"]['Enums']["question_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answer_key"?: NonNullable<Json>,"content": NonNullable<Json>,"created_at"?: string,"difficulty"?: Database["public"]['Enums']["difficulty"],"explanation"?: string | null,"grade"?: number | null,"id"?: string,"is_shared"?: boolean,"learning_objective"?: string | null,"owner_id": string,"points"?: number,"rubric"?: Json | null,"school_id": string,"subject_id"?: string | null,"topic"?: string | null,"type": Database["public"]['Enums']["question_type"],"updated_at"?: string
                  }
                  Update: {
                    "answer_key"?: NonNullable<Json>,"content"?: NonNullable<Json>,"created_at"?: string,"difficulty"?: Database["public"]['Enums']["difficulty"],"explanation"?: string | null,"grade"?: number | null,"id"?: string,"is_shared"?: boolean,"learning_objective"?: string | null,"owner_id"?: string,"points"?: number,"rubric"?: Json | null,"school_id"?: string,"subject_id"?: string | null,"topic"?: string | null,"type"?: Database["public"]['Enums']["question_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "question_bank_items_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "question_bank_items_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "question_bank_items_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    }
                  ]
                },"question_scores": {
                  Row: {
                    "answer_id": string,"approved_at": string | null,"approved_by": string | null,"attempt_id": string,"auto_points": number | null,"auto_result": Database["public"]['Enums']["score_result"],"final_points": number | null,"final_result": Database["public"]['Enums']["score_result"] | null,"max_points": number,"needs_review": boolean,"question_id": string,"teacher_feedback": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answer_id": string,"approved_at"?: string | null,"approved_by"?: string | null,"attempt_id": string,"auto_points"?: number | null,"auto_result"?: Database["public"]['Enums']["score_result"],"final_points"?: number | null,"final_result"?: Database["public"]['Enums']["score_result"] | null,"max_points": number,"needs_review"?: boolean,"question_id": string,"teacher_feedback"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "answer_id"?: string,"approved_at"?: string | null,"approved_by"?: string | null,"attempt_id"?: string,"auto_points"?: number | null,"auto_result"?: Database["public"]['Enums']["score_result"],"final_points"?: number | null,"final_result"?: Database["public"]['Enums']["score_result"] | null,"max_points"?: number,"needs_review"?: boolean,"question_id"?: string,"teacher_feedback"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "question_scores_answer_id_fkey"
      columns: ["answer_id"]
isOneToOne: true
      referencedRelation: "answers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "question_scores_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "question_scores_attempt_id_fkey"
      columns: ["attempt_id"]
isOneToOne: false
      referencedRelation: "attempts"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_limits": {
                  Row: {
                    "count": number,"key": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count": number,"key": string,"window_start": string
                  }
                  Update: {
                    "count"?: number,"key"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"result_releases": {
                  Row: {
                    "assessment_id": string,"attempt_id": string,"released_at": string,"released_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "assessment_id": string,"attempt_id": string,"released_at"?: string,"released_by"?: string | null
                  }
                  Update: {
                    "assessment_id"?: string,"attempt_id"?: string,"released_at"?: string,"released_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "result_releases_assessment_id_fkey"
      columns: ["assessment_id"]
isOneToOne: false
      referencedRelation: "assessments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "result_releases_attempt_id_fkey"
      columns: ["attempt_id"]
isOneToOne: true
      referencedRelation: "attempts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "result_releases_released_by_fkey"
      columns: ["released_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"school_memberships": {
                  Row: {
                    "created_at": string,"id": string,"role": Database["public"]['Enums']["school_role"],"school_id": string,"status": Database["public"]['Enums']["membership_status"],"student_code": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"role": Database["public"]['Enums']["school_role"],"school_id": string,"status"?: Database["public"]['Enums']["membership_status"],"student_code"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"role"?: Database["public"]['Enums']["school_role"],"school_id"?: string,"status"?: Database["public"]['Enums']["membership_status"],"student_code"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "school_memberships_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "school_memberships_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"schools": {
                  Row: {
                    "city": string | null,"created_at": string,"id": string,"is_active": boolean,"join_code": string,"name": string,"region": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "city"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"join_code"?: string,"name": string,"region"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "city"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"join_code"?: string,"name"?: string,"region"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"student_accommodations": {
                  Row: {
                    "assessment_id": string | null,"created_at": string,"created_by": string | null,"extra_attempts": number,"extra_minutes": number,"id": string,"note": string | null,"school_id": string,"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assessment_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"extra_attempts"?: number,"extra_minutes"?: number,"id"?: string,"note"?: string | null,"school_id": string,"student_id": string
                  }
                  Update: {
                    "assessment_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"extra_attempts"?: number,"extra_minutes"?: number,"id"?: string,"note"?: string | null,"school_id"?: string,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_accommodations_assessment_id_fkey"
      columns: ["assessment_id"]
isOneToOne: false
      referencedRelation: "assessments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_accommodations_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_accommodations_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_accommodations_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"subjects": {
                  Row: {
                    "code": string | null,"created_at": string,"id": string,"name_kk": string,"name_ru": string,"school_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code"?: string | null,"created_at"?: string,"id"?: string,"name_kk": string,"name_ru": string,"school_id": string
                  }
                  Update: {
                    "code"?: string | null,"created_at"?: string,"id"?: string,"name_kk"?: string,"name_ru"?: string,"school_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subjects_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"submission_files": {
                  Row: {
                    "attempt_id": string,"created_at": string,"file_name": string,"id": string,"mime_type": string,"question_id": string,"size_bytes": number,"storage_path": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_id": string,"created_at"?: string,"file_name": string,"id"?: string,"mime_type": string,"question_id": string,"size_bytes": number,"storage_path": string
                  }
                  Update: {
                    "attempt_id"?: string,"created_at"?: string,"file_name"?: string,"id"?: string,"mime_type"?: string,"question_id"?: string,"size_bytes"?: number,"storage_path"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "submission_files_attempt_id_fkey"
      columns: ["attempt_id"]
isOneToOne: false
      referencedRelation: "attempts"
      referencedColumns: ["id"]
    }
                  ]
                },"system_errors": {
                  Row: {
                    "context": NonNullable<Json>,"created_at": string,"id": string,"message": string,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "context"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"message": string,"source": string
                  }
                  Update: {
                    "context"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"message"?: string,"source"?: string
                  }
                  Relationships: [
                    
                  ]
                },"teacher_reviews": {
                  Row: {
                    "answer_id": string,"attempt_id": string,"created_at": string,"criterion_scores": Json | null,"feedback": string | null,"id": string,"points": number,"previous_points": number | null,"reviewer_id": string | null,"source": Database["public"]['Enums']["review_source"],"suggestion_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "answer_id": string,"attempt_id": string,"created_at"?: string,"criterion_scores"?: Json | null,"feedback"?: string | null,"id"?: string,"points": number,"previous_points"?: number | null,"reviewer_id"?: string | null,"source": Database["public"]['Enums']["review_source"],"suggestion_id"?: string | null
                  }
                  Update: {
                    "answer_id"?: string,"attempt_id"?: string,"created_at"?: string,"criterion_scores"?: Json | null,"feedback"?: string | null,"id"?: string,"points"?: number,"previous_points"?: number | null,"reviewer_id"?: string | null,"source"?: Database["public"]['Enums']["review_source"],"suggestion_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "teacher_reviews_answer_id_fkey"
      columns: ["answer_id"]
isOneToOne: false
      referencedRelation: "answers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "teacher_reviews_attempt_id_fkey"
      columns: ["attempt_id"]
isOneToOne: false
      referencedRelation: "attempts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "teacher_reviews_reviewer_id_fkey"
      columns: ["reviewer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"teacher_verification_requests": {
                  Row: {
                    "created_at": string,"id": string,"message": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"school_id": string,"status": Database["public"]['Enums']["request_status"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"message"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"school_id": string,"status"?: Database["public"]['Enums']["request_status"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"message"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"school_id"?: string,"status"?: Database["public"]['Enums']["request_status"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teacher_verification_requests_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "teacher_verification_requests_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "teacher_verification_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_token": string }; Returns: string
                           },
"attempt_assessment":
{ Args: { "p_attempt": string }; Returns: string
                           },
"attempt_heartbeat":
{ Args: { "p_attempt": string,"p_current_question"?: string }; Returns: Json
                           },
"attempt_owner":
{ Args: { "p_attempt": string }; Returns: string
                           },
"can_manage_assessment":
{ Args: { "p_assessment": string }; Returns: boolean
                           },
"can_view_student":
{ Args: { "p_student": string }; Returns: boolean
                           },
"claim_grading_job":
{ Args: Record<PropertyKey, never>; Returns: {
              "answer_id": string,
"attempt_id": string,
"created_at": string,
"id": string,
"last_error": string | null,
"locked_at": string | null,
"requested_by": string | null,
"status": Database["public"]['Enums']["grading_job_status"],
"tries": number,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "grading_jobs"
        isOneToOne: true
        isSetofReturn: false
      } },
"claim_ocr_job":
{ Args: Record<PropertyKey, never>; Returns: {
              "assessment_id": string | null,
"created_at": string,
"created_by": string,
"file_name": string,
"hints": NonNullable<Json>,
"id": string,
"last_error": string | null,
"locked_at": string | null,
"mime_type": string,
"page_count": number | null,
"result": Json | null,
"school_id": string,
"size_bytes": number,
"status": Database["public"]['Enums']["job_status"],
"storage_path": string,
"tries": number,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "ocr_jobs"
        isOneToOne: true
        isSetofReturn: false
      } },
"class_school":
{ Args: { "p_class": string }; Returns: string
                           },
"expire_overdue_attempts":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"finalize_attempt":
{ Args: { "p_attempt": string,"p_reason": Database["public"]['Enums']["submit_reason"] }; Returns: {
              "answered_count": number,
"assessment_id": string,
"attempt_no": number,
"created_at": string,
"current_question_id": string | null,
"deadline_at": string | null,
"grading_status": Database["public"]['Enums']["grading_status"],
"id": string,
"last_seen_at": string,
"lockdown_event_count": number,
"option_orders": NonNullable<Json>,
"question_order": (string)[],
"snapshot_id": string,
"started_at": string,
"status": Database["public"]['Enums']["attempt_status"],
"student_id": string,
"submit_reason": Database["public"]['Enums']["submit_reason"] | null,
"submitted_at": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "attempts"
        isOneToOne: true
        isSetofReturn: false
      } },
"has_school_role":
{ Args: { "p_roles": (Database["public"]['Enums']["school_role"])[],"p_school": string }; Returns: boolean
                           },
"has_school_role_for":
{ Args: { "p_role": Database["public"]['Enums']["school_role"],"p_school": string,"p_user": string }; Returns: boolean
                           },
"is_assigned":
{ Args: { "p_assessment": string,"p_student"?: string }; Returns: boolean
                           },
"is_enrolled":
{ Args: { "p_class": string }; Returns: boolean
                           },
"is_released":
{ Args: { "p_attempt": string }; Returns: boolean
                           },
"is_school_admin":
{ Args: { "p_school": string }; Returns: boolean
                           },
"is_school_member":
{ Args: { "p_school": string }; Returns: boolean
                           },
"is_school_staff":
{ Args: { "p_school": string }; Returns: boolean
                           },
"is_super_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"publish_assessment":
{ Args: { "p_assessment": string }; Returns: string
                           },
"rate_limit_hit":
{ Args: { "p_key": string,"p_limit": number,"p_window_seconds": number }; Returns: boolean
                           },
"request_teacher_access":
{ Args: { "p_join_code": string,"p_message": string }; Returns: string
                           },
"review_teacher_request":
{ Args: { "p_approve": boolean,"p_request": string }; Returns: undefined
                           },
"save_answer":
{ Args: { "p_attempt": string,"p_flagged"?: boolean,"p_question": string,"p_response": Json,"p_seq": number }; Returns: Json
                           },
"shuffle_jsonb_ids":
{ Args: { "p_items": Json }; Returns: Json
                           },
"start_attempt":
{ Args: { "p_assessment": string }; Returns: string
                           },
"submit_attempt":
{ Args: { "p_attempt": string }; Returns: Json
                           },
"teaches_class":
{ Args: { "p_class": string }; Returns: boolean
                           }
          }
          Enums: {
            "app_locale": "ru"|"kk","assessment_kind": "sor"|"soch","assessment_status": "draft"|"published"|"closed"|"archived","attempt_status": "in_progress"|"submitted","difficulty": "easy"|"medium"|"hard","grading_job_status": "queued"|"running"|"done"|"failed","grading_profile": "strict"|"balanced"|"supportive","grading_status": "pending"|"needs_review"|"graded","job_status": "uploaded"|"processing"|"extracting_text"|"generating_questions"|"review_required"|"completed"|"failed","membership_status": "active"|"suspended","question_type": "single_choice"|"multiple_choice"|"true_false"|"short_text"|"numeric"|"matching"|"ordering"|"fill_blanks"|"essay"|"file_upload"|"image_answer","release_mode": "manual"|"on_approval","request_status": "pending"|"approved"|"rejected","review_source": "auto"|"ai_accepted"|"ai_edited"|"manual","school_role": "school_admin"|"teacher"|"student","score_result": "correct"|"incorrect"|"partial"|"unanswered"|"pending","submit_reason": "manual"|"timeout"|"teacher"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "app_locale": ["ru", "kk"],"assessment_kind": ["sor", "soch"],"assessment_status": ["draft", "published", "closed", "archived"],"attempt_status": ["in_progress", "submitted"],"difficulty": ["easy", "medium", "hard"],"grading_job_status": ["queued", "running", "done", "failed"],"grading_profile": ["strict", "balanced", "supportive"],"grading_status": ["pending", "needs_review", "graded"],"job_status": ["uploaded", "processing", "extracting_text", "generating_questions", "review_required", "completed", "failed"],"membership_status": ["active", "suspended"],"question_type": ["single_choice", "multiple_choice", "true_false", "short_text", "numeric", "matching", "ordering", "fill_blanks", "essay", "file_upload", "image_answer"],"release_mode": ["manual", "on_approval"],"request_status": ["pending", "approved", "rejected"],"review_source": ["auto", "ai_accepted", "ai_edited", "manual"],"school_role": ["school_admin", "teacher", "student"],"score_result": ["correct", "incorrect", "partial", "unanswered", "pending"],"submit_reason": ["manual", "timeout", "teacher"]
          }
        }
} as const
