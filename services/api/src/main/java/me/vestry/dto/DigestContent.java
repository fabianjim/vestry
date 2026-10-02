package me.vestry.dto;

import java.util.List;

public record DigestContent(String news, String reflection, List<Question> questions,
                            List<NewsBriefing.Item> sources, NewsBriefing.Status newsStatus, boolean demoTemplate) {
    public enum Destination { DASHBOARD, HOLDINGS, JOURNAL }
    public record Question(String text, Destination destination) {}
    public DigestContent {
        questions = List.copyOf(questions);
        sources = List.copyOf(sources);
    }
}
