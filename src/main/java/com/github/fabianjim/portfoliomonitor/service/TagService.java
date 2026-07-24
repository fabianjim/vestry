package com.github.fabianjim.portfoliomonitor.service;

import com.github.fabianjim.portfoliomonitor.model.Tag;
import com.github.fabianjim.portfoliomonitor.model.User;
import com.github.fabianjim.portfoliomonitor.repository.TagRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Service
@Transactional
public class TagService {

    private static final String[] TAG_COLORS = {
        "#5e9ed6", "#10b981", "#ef4444", "#d6965e", "#8b5cf6", "#f59e0b", "#ec4899", "#6366f1"
    };

    private static final Map<String, String> RESULT_TAG_COLORS = Map.of(
        "win", "#10b981",
        "loss", "#ef4444"
    );

    private final TagRepository tagRepository;

    public TagService(TagRepository tagRepository) {
        this.tagRepository = tagRepository;
    }

    public List<Tag> findPopularTags(User user, String prefix, int limit) {
        String query = prefix == null ? "" : prefix;
        return tagRepository.findTopTagsByUserAndPrefix(user.getId(), query.toLowerCase(), PageRequest.of(0, limit));
    }

    public Set<Tag> resolveTags(User user, List<String> tagNames) {
        Set<Tag> tags = new HashSet<>();
        if (tagNames == null) {
            return tags;
        }

        for (String name : tagNames) {
            String normalized = normalizeTagName(name);
            if (normalized.isEmpty()) {
                continue;
            }

            Optional<Tag> existing = tagRepository.findByUserIdAndName(user.getId(), normalized);
            if (existing.isPresent()) {
                tags.add(existing.get());
            } else {
                Tag tag = new Tag();
                tag.setName(normalized);
                tag.setColor(RESULT_TAG_COLORS.getOrDefault(normalized, assignColor(user)));
                tag.setUser(user);
                tags.add(tagRepository.save(tag));
            }
        }
        return tags;
    }

    public void deleteTag(int userId, int tagId) {
        Tag tag = tagRepository.findById(tagId)
            .orElseThrow(() -> new RuntimeException("Tag not found"));
        if (tag.getUser().getId() != userId) {
            throw new RuntimeException("Tag not found");
        }
        tagRepository.delete(tag);
    }

    private String assignColor(User user) {
        long count = tagRepository.countByUserId(user.getId());
        return TAG_COLORS[(int) (count % TAG_COLORS.length)];
    }

    private String normalizeTagName(String name) {
        if (name == null) {
            return "";
        }
        return name.trim().replaceAll("^#+", "").toLowerCase();
    }
}
